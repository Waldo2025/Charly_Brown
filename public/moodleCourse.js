// Firebase imports
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    query,
    collection,
    where,
    getDocs,
    deleteDoc,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';

import {
    getAuth,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';


import { 
    generarContenidoGemini, 
    generarModuloGemini,
    getGeminiEndpoint,
    reformularParrafoConIA,
} from './moodlecourse-geminiOperations.js';

import { 
    activarEdicionModuloCompleto,
    desactivarEdicionModuloCompleto,
    guardarContenidoModulo,
} from './moodleClurse-extraFunctions.js';


/* CONFIGURACIÓN FIREBASE */
const firebaseConfig = {
    apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
    authDomain: "charly-brown.firebaseapp.com",
    projectId: "charly-brown",
    storageBucket: "charly-brown.firebasestorage.app",
    messagingSenderId: "128488238449",
    appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
    measurementId: "G-RL0BMDZKE6"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


export let currentUserId = null;

const listaCursos = document.getElementById("listaCursos");
let cursosUsuario = [];
/* ============================================================
   CONFIGURACIÓN GEMINI
============================================================ */



/* VARIABLES GLOBALES */
let cursoDocId = null;
let curso = null;
let temaActivo = null;
let subtemaActivo = null;


let moduloEditandoCompleto = null;
let moduloEditandoInstruccionesId = null;
let cursosOtrosUsuarios = [];
let currentUserRole = null;
const moduloAutosaveTimers = new Map();
let mostrarModulosArchivados = localStorage.getItem("cb_mostrar_modulos_archivados") === "1";

let textoOriginalParaReformular = "";
let seleccionOriginalParaReformular = null;
const USE_SORTABLE_SIDEBAR = typeof window !== 'undefined' && !!window.Sortable;
let sortableTemasInstance = null;
let sortableSubtemasInstances = [];
const modulosCache = new Map();
const TOUR_MODULOS_STORAGE_KEY = "cb_tour_acciones_modulo_v1";
let tourAccionesModuloActivo = false;
let tourAccionesModuloPaso = 0;
let tourAccionesModuloTarget = null;
let tourAccionesModuloMostradoEnSesion = false;

function construirDocIdModulo(moduloId, cursoIdRef = null) {
    const cursoId = cursoIdRef || (curso ? curso.id : null);
    if (!moduloId || !cursoId) return null;
    return moduloId.includes('_') ? moduloId : `${cursoId}_${moduloId}`;
}

function actualizarBotonToggleArchivados() {
    const lbl = document.getElementById("labelToggleArchivados");
    if (!lbl) return;
    lbl.textContent = mostrarModulosArchivados ? "Archivados: Visibles" : "Archivados: Ocultos";
}

function inicializarToggleArchivadosUI() {
    const btn = document.getElementById("btnToggleArchivados");
    if (!btn || btn.dataset.cbBound === "1") return;

    btn.addEventListener("click", () => {
        mostrarModulosArchivados = !mostrarModulosArchivados;
        localStorage.setItem("cb_mostrar_modulos_archivados", mostrarModulosArchivados ? "1" : "0");
        actualizarBotonToggleArchivados();

        if (subtemaActivo) {
            cargarSubtema(subtemaActivo);
        }
        renderTemas();
    });

    btn.dataset.cbBound = "1";
    actualizarBotonToggleArchivados();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarToggleArchivadosUI);
} else {
    inicializarToggleArchivadosUI();
}

/* ESPERAR A QUE EL USUARIO INICIE SESIÓN */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Debes iniciar sesión.");
    return;
  }

  currentUserId = user.uid;
  window.currentUserId = user.uid;
  currentUserRole = "user";

  await cargarCursosUsuario();
  
  // 🔥 CORRECCIÓN: NO abrir automáticamente el modal
  // En lugar de eso, puedes mostrar un mensaje o botón para crear el primer curso
  if (cursosUsuario.length === 0) {
    // OPCIONAL: Mostrar un mensaje amigable en la lista de cursos
    listaCursos.innerHTML = `
      <li class="p-4 text-center">
        <p class="text-sm text-gray-600 mb-3">No tienes cursos aún</p>
        <button id="btnPrimerCurso" 
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
          Crear mi primer curso
        </button>
      </li>
    `;
    
    // Agregar evento al botón personalizado
    document.getElementById("btnPrimerCurso")?.addEventListener("click", () => {
      document.getElementById("btnNuevoCurso").click();
    });
  }
});


async function cargarCursosUsuario() {
    try {
        
        if (!currentUserId) {
            cursosUsuario = [];
            renderListaCursos();
            return;
        }
        
        // 🔥 SOLUCIÓN: Buscar cursos propios y compartidos en PARALELO pero con filtro correcto
        const qPropios = query(
            collection(db, "moodleCourses"),
            where("userId", "==", currentUserId)
        );
        
        const qCompartidos = query(
            collection(db, "moodleCourses"),
            where("compartidoCon", "array-contains", currentUserId)
        );
        
        // Ejecutar ambas consultas en paralelo
        const [snapPropios, snapCompartidos] = await Promise.all([
            getDocs(qPropios),
            getDocs(qCompartidos)
        ]);
        
        // 🔥 USAR MAP PARA EVITAR DUPLICADOS
        const cursosMap = new Map();
        
        // 1. Procesar cursos propios (userId === currentUserId)
        snapPropios.docs.forEach(d => {
            const data = d.data();
            const cursoId = d.id;
            
            const curso = {
                id: cursoId,
                nombre: data.nombre || "Sin nombre",
                descripcion: data.descripcion || "",
                userId: data.userId,
                cursoId: data.cursoId || cursoId,
                creado: data.creado || new Date(),
                temas: data.temas || [],
                esPropio: true,
                permisos: {
                    editar: true,
                    compartir: true,
                    eliminar: true
                },
                tipo: "propio",
                compartidoCon: data.compartidoCon || [],
                compartidoConDetalles: data.compartidoConDetalles || []
            };
            
            cursosMap.set(cursoId, curso);
        });
        
        // 2. Procesar cursos compartidos donde el usuario NO es propietario
        snapCompartidos.docs.forEach(d => {
            const data = d.data();
            const cursoId = d.id;
            
            // 🔥 VERIFICACIÓN CRÍTICA: Si ya está en el mapa (es curso propio), IGNORAR
            if (cursosMap.has(cursoId)) {
                return;
            }
            
            // Verificar que el usuario NO sea el propietario
            if (data.userId === currentUserId) {
                return;
            }
            
            // Obtener permisos específicos para este usuario
            let permisosUsuario = { editar: false, compartir: false, eliminar: false };
            let propietarioNombre = "Usuario Desconocido";
            let propietarioId = data.userId;
            
            if (data.compartidoConDetalles && Array.isArray(data.compartidoConDetalles)) {
                const detalleUsuario = data.compartidoConDetalles.find(
                    detalle => detalle.userId === currentUserId
                );
                
                if (detalleUsuario) {
                    permisosUsuario = {
                        editar: detalleUsuario.permisos?.editar || false,
                        compartir: detalleUsuario.permisos?.compartir || false,
                        eliminar: false
                    };
                }
                
                // Obtener nombre del propietario
                const propietarioDetalle = data.compartidoConDetalles.find(
                    detalle => detalle.userId === propietarioId
                );
                if (propietarioDetalle && propietarioDetalle.userName) {
                    propietarioNombre = propietarioDetalle.userName;
                }
            }
            
            const curso = {
                id: cursoId,
                nombre: data.nombre || "Curso compartido",
                descripcion: data.descripcion || "",
                userId: data.userId,
                cursoId: data.cursoId || cursoId,
                creado: data.creado || new Date(),
                temas: data.temas || [],
                esPropio: false,
                permisos: permisosUsuario,
                propietarioNombre: propietarioNombre,
                propietarioId: propietarioId,
                tipo: "compartido",
                fechaCompartido: data.actualizado || new Date(),
                acceso: permisosUsuario.editar ? "editable" : "lectura",
                compartidoCon: data.compartidoCon || [],
                compartidoConDetalles: data.compartidoConDetalles || []
            };
            
            cursosMap.set(cursoId, curso);
        });
        
        // Convertir Map a array
        cursosUsuario = Array.from(cursosMap.values());
        
        
        // Ordenar: primero propios, luego compartidos, luego por fecha
        cursosUsuario.sort((a, b) => {
            // Primero propios vs compartidos
            if (a.esPropio && !b.esPropio) return -1;
            if (!a.esPropio && b.esPropio) return 1;
            
            // Luego por fecha (más reciente primero)
            const fechaA = a.creado?.toDate ? a.creado.toDate() : new Date(a.creado || Date.now());
            const fechaB = b.creado?.toDate ? b.creado.toDate() : new Date(b.creado || Date.now());
            return fechaB - fechaA;
        });
        
        renderListaCursos();
        
    } catch (err) {
        mostrarNotificacion("Error al cargar los cursos", 'error');
        cursosUsuario = [];
        renderListaCursos();
    }
}


function renderListaCursos() {
    // Limpiar completamente la lista antes de renderizar
    listaCursos.innerHTML = "";
    
    // Verificar si hay cursos para mostrar
    if (!cursosUsuario || cursosUsuario.length === 0) {
        listaCursos.innerHTML = `
            <li class="p-3 text-xs text-gray-500 italic text-center">
                No hay cursos creados
            </li>
        `;
        return;
    }
    
    // Separar cursos propios y compartidos
    const cursosPropios = cursosUsuario.filter(c => c.esPropio);
    const cursosCompartidos = cursosUsuario.filter(c => !c.esPropio);
    
    // Ordenar por fecha (más recientes primero)
    const ordenarPorFecha = (a, b) => {
        const fechaA = a.creado?.toDate ? a.creado.toDate() : new Date(a.creado || Date.now());
        const fechaB = b.creado?.toDate ? b.creado.toDate() : new Date(b.creado || Date.now());
        return fechaB - fechaA;
    };
    
    cursosPropios.sort(ordenarPorFecha);
    cursosCompartidos.sort(ordenarPorFecha);
    
    // Renderizar cursos propios
    if (cursosPropios.length > 0) {
        const tituloPropios = document.createElement("div");
        tituloPropios.className = "px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1";
        tituloPropios.textContent = "Mis Cursos";
        listaCursos.appendChild(tituloPropios);
        
        cursosPropios.forEach(cursoItem => {
            renderCursoItem(cursoItem);
        });
    }
    
    // Renderizar cursos compartidos
    if (cursosCompartidos.length > 0) {
        const tituloCompartidos = document.createElement("div");
        tituloCompartidos.className = "px-2 py-1 mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-t border-border";
        tituloCompartidos.textContent = "Compartidos Conmigo";
        listaCursos.appendChild(tituloCompartidos);
        
        cursosCompartidos.forEach(cursoItem => {
            renderCursoItem(cursoItem);
        });
    }
    
    // Si no hay cursos de ningún tipo
    if (cursosPropios.length === 0 && cursosCompartidos.length === 0) {
        listaCursos.innerHTML = `
            <li class="p-3 text-xs text-muted-foreground italic text-center">
                No hay cursos disponibles
            </li>
        `;
    }
}

function renderCursoItem(cursoItem) {
    const esActivo = cursoDocId === cursoItem.id;
    
    const li = document.createElement("li");
    li.className = `curso-item flex items-center justify-between gap-2 p-2 text-xs rounded cursor-pointer transition-colors duration-200 ${
        esActivo ? 'active highlight-pulse' : ''
    }`;
    li.dataset.id = cursoItem.id;
    li.dataset.tipo = cursoItem.esPropio
        ? "propio"
        : cursoItem.esOtro
        ? "otro"
        : "compartido";

    
    // Determinar ícono y color basado en el tipo de curso
    const icono = cursoItem.esPropio
        ? 'fa-book'
        : cursoItem.esOtro
        ? 'fa-layer-group'
        : 'fa-share-from-square';

    const colorIcono = 'curso-item-icon';

    
    // Determinar qué botones mostrar según permisos
    const botonesPropios = `
        <i class="fas fa-share-alt cursor-pointer cb-action-icon btn-share-curso" 
           title="Compartir curso"></i>
        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-curso" 
           title="Duplicar curso"></i>
        <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-curso" 
           title="Editar nombre del curso"></i>
        <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-curso" 
           title="Eliminar curso"></i>
    `;
    
    const botonesCompartidos = `
        ${cursoItem.permisos?.compartir ? 
        `<i class="fas fa-share-alt cursor-pointer cb-action-icon btn-share-curso" 
            title="Compartir curso"></i>` : ''
        }
        ${cursoItem.permisos?.editar ? 
            `<i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-curso" 
               title="Editar nombre del curso"></i>` : 
            `<i class="fas fa-eye curso-readonly-icon cb-action-icon" title="Solo lectura"></i>`
        }

        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-curso" 
           title="Duplicar curso"></i>
    `;
    
    li.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-w-0">
            <i class="fas ${icono} ${colorIcono} cb-node-icon flex-shrink-0"></i>
            <div class="flex flex-col min-w-0 flex-1">
                <span class="curso-nombre ${esActivo ? 'font-semibold' : ''} truncate" title="${cursoItem.nombre}">
                    ${cursoItem.nombre}
                </span>
                ${!cursoItem.esPropio ? `
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] curso-owner-label truncate" title="Compartido por ${cursoItem.propietarioNombre || 'Usuario'}">
                            <i class="fas fa-user-friends mr-1 cb-node-icon"></i>${cursoItem.propietarioNombre || 'Usuario'}
                        </span>
                        ${cursoItem.permisos?.editar ? 
                            `<span class="text-[9px] curso-pill px-1 rounded">Editable</span>` : 
                            `<span class="text-[9px] curso-pill curso-pill-muted px-1 rounded">Solo lectura</span>`
                        }
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div class="flex items-center gap-1 ml-2 curso-actions flex-shrink-0">
            ${cursoItem.esPropio ? botonesPropios : botonesCompartidos}
        </div>
    `;
    
    // Función para manejar clics en el curso (excepto en los botones de acción)
    li.addEventListener("click", (e) => {
        // Si el clic fue en un botón de acción, no hacer nada
        if (e.target.closest(".btn-edit-curso") || 
            e.target.closest(".btn-delete-curso") || 
            e.target.closest(".btn-duplicate-curso") ||
            e.target.closest(".btn-share-curso")) {
            return;
        }
        
        const sidebarTemas = document.getElementById("sidebarTemas");
        
        // Si ya está seleccionado → colapsar sidebarTemas
        if (cursoDocId === cursoItem.id && !sidebarTemas.classList.contains("hidden")) {
            sidebarTemas.classList.add("hidden");
            // Limpiar estados
            localStorage.removeItem("temaAbierto");
            localStorage.removeItem("subtemaAbierto");
            localStorage.removeItem("moduloActivo");
            cursoDocId = null;
            
            // Actualizar clases activas
            document.querySelectorAll('.curso-item').forEach(item => {
                item.classList.remove('active', 'highlight-pulse');
            });
            return;
        }
        
        // Para cursos compartidos sin permisos de edición, mostrar advertencia
        if (!cursoItem.esPropio && !cursoItem.permisos?.editar) {
            if (!confirm("Este curso está en modo solo lectura. ¿Deseas abrirlo para ver el contenido?")) {
                return;
            }
        }
        
        // Seleccionar curso normalmente
        seleccionarCurso(cursoItem.id);
    });
    
    // Botón compartir (solo para cursos propios)
    const btnShare = li.querySelector(".btn-share-curso");
    if (btnShare) {
        btnShare.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Almacenar referencia al curso que se quiere compartir
            window.cursoCompartiendo = cursosUsuario.find(c => c.id === cursoItem.id);
            if (!window.cursoCompartiendo) return;
            
            // Actualizar el nombre del curso en el modal
            const cursoCompartirNombre = document.getElementById("cursoCompartirNombre");
            if (cursoCompartirNombre) {
                cursoCompartirNombre.textContent = window.cursoCompartiendo.nombre;
            }
            
            // Cargar usuarios para compartir
            if (typeof cargarUsuariosParaCompartirCurso === 'function') {
                cargarUsuariosParaCompartirCurso();
            }
            
            // Resetear checkboxes de permisos
            const checkEditar = document.getElementById("checkPermisoEditar");
            const checkCompartir = document.getElementById("checkPermisoCompartir");
            if (checkEditar) checkEditar.checked = true;
            if (checkCompartir) checkCompartir.checked = true;
            
            // Mostrar el modal
            const modalCompartir = document.getElementById("modalCompartirCurso");
            if (modalCompartir) {
                modalCompartir.classList.remove("hidden");
                modalCompartir.classList.add("flex");
            }
        });
    }
    
    // Botón editar curso
    const btnEdit = li.querySelector(".btn-edit-curso");
    if (btnEdit) {
        btnEdit.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Guardar referencia al curso que se está editando
            cursoEditando = {
                id: cursoItem.id,
                nombre: cursoItem.nombre,
                esPropio: cursoItem.esPropio,
                permisos: cursoItem.permisos
            };
            
            // Para cursos compartidos sin permisos, mostrar mensaje
            if (!cursoItem.esPropio && !cursoItem.permisos?.editar) {
                alert("No tienes permisos para editar este curso. Solo puedes verlo en modo lectura.");
                return;
            }
            
            inputEditarNombreCurso.value = cursoEditando.nombre;
            inputEditarNombreCurso.focus();
            
            modalEditarCurso.classList.remove("hidden");
            modalEditarCurso.classList.add("flex");
        });
    }
    
    // Botón duplicar curso
    const btnDuplicate = li.querySelector(".btn-duplicate-curso");
    if (btnDuplicate) {
        btnDuplicate.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Verificar que el usuario esté autenticado
            if (!currentUserId) {
                alert("Debes iniciar sesión para duplicar cursos.");
                return;
            }
            
            // Buscar el curso a duplicar
            const cursoADuplicar = cursosUsuario.find(c => c.id === cursoItem.id);
            if (!cursoADuplicar) return;
            
            const nombreCurso = cursoADuplicar.nombre || "Curso";
            if (!confirm(`¿Duplicar el curso "${nombreCurso}" completo?`)) return;
            
            try {
                // 1️⃣ Obtener datos COMPLETOS del curso original desde Firebase
                const cursoRef = doc(db, "moodleCourses", cursoItem.id);
                const cursoSnap = await getDoc(cursoRef);
                
                if (!cursoSnap.exists()) {
                    alert("El curso original no existe.");
                    return;
                }
                
                const cursoOriginalData = cursoSnap.data();
                
                // 2️⃣ Generar nuevo ID de curso
                const nuevoId = crypto.randomUUID();
                
                // 3️⃣ Crear copia profunda con nuevos IDs
                const nuevoCurso = {
                    ...cursoOriginalData,
                    id: nuevoId,
                    cursoId: nuevoId,
                    nombre: cursoOriginalData.nombre + " (Copia)",
                    userId: currentUserId,
                    creado: new Date(),
                    actualizado: new Date(),
                    // Limpiar datos de compartir
                    compartidoCon: [],
                    compartidoConDetalles: [],
                    // Marcar como propio y editable
                    esPropio: true,
                    permisos: {
                        editar: true,
                        compartir: true,
                        eliminar: true
                    }
                };
                
                // 4️⃣ Regenerar IDs internos (temas y subtemas)
                if (Array.isArray(nuevoCurso.temas)) {
                    const idMap = new Map(); // Para mapear IDs viejos a nuevos
                    
                    nuevoCurso.temas = nuevoCurso.temas.map(t => {
                        const nuevoTemaId = crypto.randomUUID();
                        const temaViejoId = t.id;
                        
                        idMap.set(temaViejoId, nuevoTemaId);
                        
                        const nuevoTema = { 
                            ...t, 
                            id: nuevoTemaId,
                            subtemas: []
                        };
                        
                        // Regenerar IDs de subtemas
                        if (Array.isArray(t.subtemas)) {
                            nuevoTema.subtemas = t.subtemas.map(st => {
                                const nuevoSubtemaId = crypto.randomUUID();
                                const subtemaViejoId = st.id;
                                
                                idMap.set(subtemaViejoId, nuevoSubtemaId);
                                
                                // Mantener referencia a los módulos
                                const nuevosModulosIds = [...(st.modulosIds || [])];
                                
                                return { 
                                    ...st, 
                                    id: nuevoSubtemaId,
                                    modulosIds: nuevosModulosIds
                                };
                            });
                        }
                        
                        return nuevoTema;
                    });
                }
                
                // 5️⃣ Duplicar TODOS los módulos individualmente con nuevos IDs
                if (nuevoCurso.temas) {
                    for (const tema of nuevoCurso.temas) {
                        if (tema.subtemas) {
                            for (const subtema of tema.subtemas) {
                                if (subtema.modulosIds && Array.isArray(subtema.modulosIds)) {
                                    const nuevosModulosIds = [];
                                    
                                    for (const moduloId of subtema.modulosIds) {
                                        try {
                                            // Construir ID compuesto para buscar el módulo original
                                            const idParaBuscar = moduloId.includes('_') ? 
                                                moduloId : `${cursoItem.id}_${moduloId}`;
                                            
                                            const moduloOriginal = await obtenerModulo(idParaBuscar, cursoItem.id);
                                            
                                            if (moduloOriginal) {
                                                // Generar nuevo ID para el módulo
                                                const nuevoModuloId = crypto.randomUUID();
                                                const idFirestore = `${nuevoId}_${nuevoModuloId}`;
                                                
                                                // Crear copia del módulo con nuevo ID
                                                const nuevoModulo = {
                                                    ...moduloOriginal,
                                                    id: nuevoModuloId,
                                                    cursoId: nuevoId,
                                                    subtemaId: subtema.id,
                                                    creado: new Date(),
                                                    actualizado: new Date(),
                                                    // 🔥 Asegurar que los campos de edición estén limpios
                                                    editable: true,
                                                    // 🔥 Limpiar cualquier referencia de solo lectura
                                                    modoLectura: false
                                                };
                                                
                                                // Guardar el nuevo módulo
                                                await setDoc(doc(db, "moodleCourses", idFirestore), nuevoModulo);
                                                
                                                // Reemplazar ID viejo por nuevo en el subtema
                                                nuevosModulosIds.push(nuevoModuloId);
                                            } else {
                                                // Si no se encuentra el módulo original, mantener el ID
                                                nuevosModulosIds.push(moduloId);
                                            }
                                        } catch (moduloError) {
                                            nuevosModulosIds.push(moduloId); // Mantener ID original como fallback
                                        }
                                    }
                                    
                                    // Actualizar el array de módulos en el subtema
                                    subtema.modulosIds = nuevosModulosIds;
                                }
                            }
                        }
                    }
                }
                
                // 6️⃣ Guardar el curso duplicado en Firebase
                await setDoc(doc(db, "moodleCourses", nuevoId), nuevoCurso);
                
                // 7️⃣ Recargar la lista completa desde Firebase
                await cargarCursosUsuario();
                
                // 8️⃣ Seleccionar el curso duplicado
                setTimeout(() => {
                    seleccionarCurso(nuevoId);
                }, 500);
                
                alert("✅ Curso duplicado exitosamente. Todos los elementos son editables.");
                
            } catch (err) {
                alert("❌ Error al duplicar el curso: " + err.message);
            }
        });
    }


    // Botón eliminar curso (solo para cursos propios)
    const btnDelete = li.querySelector(".btn-delete-curso");
    if (btnDelete) {
        btnDelete.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Para cursos compartidos, no mostrar botón de eliminar
            if (!cursoItem.esPropio) return;
            
            if (!confirm(`¿Eliminar el curso "${cursoItem.nombre}" completo? Esta acción no se puede deshacer.`)) return;
            
            try {
                // 1. Eliminar de Firebase
                await deleteDoc(doc(db, "moodleCourses", cursoItem.id));
                
                // 2. Eliminar módulos asociados
                try {
                    // Obtener todos los módulos del curso
                    const modulosIds = [];
                    if (Array.isArray(cursoItem.temas)) {
                        cursoItem.temas.forEach(tema => {
                            if (Array.isArray(tema.subtemas)) {
                                tema.subtemas.forEach(subtema => {
                                    if (Array.isArray(subtema.modulosIds)) {
                                        modulosIds.push(...subtema.modulosIds);
                                    }
                                });
                            }
                        });
                    }
                    
                    // Eliminar cada módulo
                    for (const moduloId of modulosIds) {
                        try {
                            await deleteDoc(doc(db, "moodleCourses", `${cursoItem.id}_${moduloId}`));
                        } catch (moduloError) {
                        }
                    }
                } catch (modulosError) {
                }
                
                // 3. Recargar lista desde Firebase
                await cargarCursosUsuario();
                
                // 4. Si el curso eliminado es el que está seleccionado, limpiar completamente
                if (cursoDocId === cursoItem.id) {
                    // Limpiar todas las variables globales
                    cursoDocId = null;
                    curso = null;
                    temaActivo = null;
                    subtemaActivo = null;
                    
                    // Limpiar localStorage relacionado con el curso
                    localStorage.removeItem("cursoSeleccionado");
                    localStorage.removeItem("temaAbierto");
                    localStorage.removeItem("subtemaAbierto");
                    localStorage.removeItem("moduloActivo");
                    
                    // Ocultar sidebar de temas
                    const sidebarTemas = document.getElementById("sidebarTemas");
                    if (sidebarTemas) sidebarTemas.classList.add("hidden");
                    
                    // Limpiar editor
                    const contenidoEditor = document.getElementById("contenidoEditor");
                    if (contenidoEditor) {
                        contenidoEditor.innerHTML = `
                            <div class="empty-state text-center py-10 text-gray-400">
                                <i class="fas fa-layer-group text-3xl mb-2"></i>
                                <p class="text-sm">Selecciona un curso para comenzar</p>
                            </div>
                        `;
                    }
                    
                    // Limpiar nombre del curso seleccionado
                    const cursoSeleccionadoNombre = document.getElementById("cursoSeleccionadoNombre");
                    if (cursoSeleccionadoNombre) {
                        cursoSeleccionadoNombre.innerText = "Selecciona un curso";
                    }
                    
                    // Deshabilitar botón de añadir tema
                    const btnAddTema = document.getElementById("btnAddTema");
                    if (btnAddTema) {
                        btnAddTema.disabled = true;
                    }
                }
                
                // 5. Si el curso eliminado era el que se estaba editando, limpiar esa referencia
                if (cursoEditando && cursoEditando.id === cursoItem.id) {
                    cursoEditando = null;
                }
                
                // 6. Si quedan cursos, seleccionar el primero automáticamente
                if (cursosUsuario.length > 0) {
                    setTimeout(() => {
                        const primerCurso = cursosUsuario[0];
                        if (primerCurso && primerCurso.id) {
                            seleccionarCurso(primerCurso.id);
                        }
                    }, 300);
                }
                
                alert("✅ Curso eliminado exitosamente.");
                
            } catch (err) {
                alert("❌ Error al eliminar el curso: " + err.message);
                
                // Si hay error, recargar los cursos desde Firebase
                await cargarCursosUsuario();
            }
        });
    }
    
    listaCursos.appendChild(li);
}

function limpiarEstadosActivos() {
    // Remover clases activas
    document.querySelectorAll('.curso-item.active').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.subtema-activo').forEach(item => {
        item.classList.remove('subtema-activo');
    });
    
    document.querySelectorAll('.modulo-activo').forEach(item => {
        item.classList.remove('modulo-activo');
    });
    
    // Limpiar localStorage
    localStorage.removeItem("temaAbierto");
    localStorage.removeItem("subtemaAbierto");
}


const modalCrearCurso = document.getElementById("modalCrearCurso");
const inputNombreCurso = document.getElementById("inputNombreCurso");
const btnCrearCurso = document.getElementById("btnConfirmarCrearCurso");
const btnCancelarCrearCurso = document.getElementById("btnCancelarCrearCurso");





// Función para mostrar/ocultar permisos según modo de compartir
function togglePermisosSegunModo() {
    const modoCopia = document.getElementById('radioCopia').checked;
    const permisosDiv = document.getElementById('permisosColaboracion');
    
    if (modoCopia) {
        permisosDiv.classList.add('hidden');
    } else {
        permisosDiv.classList.remove('hidden');
    }
}

// Conectar eventos a los radios
document.addEventListener('DOMContentLoaded', function() {
    const radios = document.querySelectorAll('input[name="modoCompartir"]');
    radios.forEach(radio => {
        radio.addEventListener('change', togglePermisosSegunModo);
    });
});

// Función principal para compartir curso
// Busca esta función (aproximadamente línea 490):
document.getElementById('btnConfirmarCompartirCurso').addEventListener('click', async function() {
    const curso = window.cursoCompartiendo;
    if (!curso || !window.currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    // Obtener modo de compartir seleccionado
    const modoCopia = document.getElementById('radioCopia').checked;
    const modoColaboracion = document.getElementById('radioColaboracion').checked;
    
    if (!modoCopia && !modoColaboracion) {
        mostrarNotificacion("Selecciona un modo de compartir", "error");
        return;
    }

    // 🔥 CORRECCIÓN: Obtener TODOS los usuarios (nuevos y ya compartidos)
    // 1. Usuarios ya compartidos (vienen del array compartidoConDetalles)
    const usuariosYaCompartidos = curso.compartidoConDetalles || [];
    
    // 2. Usuarios seleccionados en checkboxes
    const usuariosNuevosSeleccionados = Array.from(
        document.querySelectorAll('#listaUsuariosCompartirCurso input[type="checkbox"]:checked')
    ).map(cb => ({
        userId: cb.dataset.userid,
        userName: cb.dataset.username,
        email: cb.dataset.useremail || ''
    }));

    // 🔥 CORRECCIÓN: Validar que hay al menos UN usuario nuevo seleccionado
    // (los ya compartidos no cuentan para esta validación)
    if (usuariosNuevosSeleccionados.length === 0) {
        // Verificar si hay usuarios en la sección "Ya compartido con:"
        const hayUsuariosEnEdicion = document.querySelectorAll('.btn-editar-permisos').length > 0;
        
        if (!hayUsuariosEnEdicion) {
            mostrarNotificacion("Selecciona al menos un usuario nuevo para compartir", "error");
            return;
        }
        
        // Si solo hay usuarios ya compartidos, mostrar mensaje diferente
        if (usuariosYaCompartidos.length > 0) {
            mostrarNotificacion("Solo hay usuarios ya compartidos. Selecciona nuevos usuarios.", "info");
            return;
        }
    }

    // Obtener permisos si es modo colaboración
    let permisosEditar = false;
    let permisosCompartir = false;
    
    if (modoColaboracion) {
        permisosEditar = document.getElementById('checkPermisoEditar').checked;
        permisosCompartir = document.getElementById('checkPermisoCompartir').checked;
    }

       const btn = this;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compartiendo...';


    try {
        let usuariosProcesados = 0;
        let errores = [];
        
        // 🔥 CORRECCIÓN: Filtrar usuarios ya compartidos de los nuevos
        // Para evitar duplicar operaciones con usuarios ya compartidos
        const usuariosParaCompartir = usuariosNuevosSeleccionados.filter(nuevo => {
            // Verificar si ya está compartido
            return !usuariosYaCompartidos.some(existente => 
                existente.userId === nuevo.userId
            );
        });
        
        // 🔥 CORRECCIÓN: Si no hay usuarios nuevos después de filtrar
        if (usuariosParaCompartir.length === 0 && usuariosYaCompartidos.length > 0) {
            mostrarNotificacion("Los usuarios seleccionados ya tienen acceso al curso", "info");
            return;
        }

        for (const usuario of usuariosParaCompartir) {
            try {
                if (modoCopia) {
                    await compartirComoCopia(curso, usuario);
                } else {
                    await compartirComoColaboracion(curso, usuario, permisosEditar, permisosCompartir);
                }
                usuariosProcesados++;
            } catch (error) {
                errores.push(`${usuario.userName}: ${error.message}`);
            }
        }

        // 🔥 CORRECCIÓN: Mostrar mensaje apropiado
        if (usuariosProcesados > 0) {
            mostrarNotificacion(
                `✅ Curso compartido exitosamente con ${usuariosProcesados} usuario(s)`,
                'success'
            );
            
            // Cerrar modal
            document.getElementById('modalCompartirCurso').classList.add('hidden');
            
            // Recargar cursos
            await cargarCursosUsuario();
            
            // Limpiar selección
            window.cursoCompartiendo = null;
        } else if (errores.length > 0) {
            // Mostrar errores específicos
            const mensajeErrores = errores.slice(0, 3).join(', ');
            mostrarNotificacion(`❌ Errores al compartir: ${mensajeErrores}${errores.length > 3 ? '...' : ''}`, 'error');
        }
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
});

// Función para compartir como copia
async function compartirComoCopia(cursoOriginal, usuarioDestino) {
    try {
        // 🔥 CORRECCIÓN: Verificar si ya existe una copia para este usuario
        const nombreCopia = `${cursoOriginal.nombre} (Copia para ${usuarioDestino.userName})`;
        
        // Buscar si ya existe una copia
        const copiaExistente = cursosUsuario.find(c => 
            c.nombre === nombreCopia && 
            c.userId === usuarioDestino.userId
        );
        
        if (copiaExistente) {
            return; // No crear duplicado
        }
        

        // 1. Crear nuevo ID para la copia
        const nuevoId = crypto.randomUUID();
        
        // 2. Obtener datos completos del curso original
        const cursoRef = doc(db, "moodleCourses", cursoOriginal.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            throw new Error("El curso original no existe");
        }
        
        const cursoData = cursoSnap.data();
        
        // 3. Crear objeto del nuevo curso (copia)
        const nuevoCurso = {
            ...cursoData,
            id: nuevoId,
            cursoId: nuevoId,
            nombre: cursoData.nombre + " (Copia para " + usuarioDestino.userName + ")",
            userId: usuarioDestino.userId,
            esPropio: true,
            creado: new Date(),
            compartidoCon: [],
            compartidoConDetalles: [],
            // Información sobre el origen de la copia
            copiaDe: {
                cursoId: cursoOriginal.id,
                nombre: cursoOriginal.nombre,
                propietarioOriginal: cursoOriginal.userId,
                fechaCopia: new Date()
            }
        };
        
        // 4. Limpiar datos de compartir (es una nueva copia independiente)
        delete nuevoCurso.compartidoCon;
        delete nuevoCurso.compartidoConDetalles;
        delete nuevoCurso.propietarioNombre;
        
        // 5. Regenerar IDs internos
        if (Array.isArray(nuevoCurso.temas)) {
            nuevoCurso.temas = nuevoCurso.temas.map(t => {
                const nuevoTema = { 
                    ...t, 
                    id: crypto.randomUUID(),
                    subtemas: []
                };
                
                if (Array.isArray(t.subtemas)) {
                    nuevoTema.subtemas = t.subtemas.map(st => {
                        const nuevoSubtema = { 
                            ...st, 
                            id: crypto.randomUUID(),
                            modulosIds: [...(st.modulosIds || [])]
                        };
                        return nuevoSubtema;
                    });
                }
                
                return nuevoTema;
            });
        }
        
        // 6. Guardar el nuevo curso
        await setDoc(doc(db, "moodleCourses", nuevoId), nuevoCurso);
        
        // 7. Copiar módulos individuales
        const modulosExistentes = [];
        if (Array.isArray(nuevoCurso.temas)) {
            nuevoCurso.temas.forEach(tema => {
                if (Array.isArray(tema.subtemas)) {
                    tema.subtemas.forEach(subtema => {
                        if (Array.isArray(subtema.modulosIds)) {
                            subtema.modulosIds.forEach(moduloId => {
                                modulosExistentes.push(moduloId);
                            });
                        }
                    });
                }
            });
        }
        
        for (const moduloId of modulosExistentes) {
            try {
                const moduloOriginal = await obtenerModulo(moduloId, cursoOriginal.id);
                if (moduloOriginal) {
                    const nuevoModuloId = crypto.randomUUID();
                    const nuevoModulo = {
                        ...moduloOriginal,
                        id: nuevoModuloId,
                        cursoId: nuevoId,
                        creado: new Date(),
                        actualizado: new Date()
                    };
                    
                    // Actualizar referencia en el subtema
                    nuevoCurso.temas.forEach(tema => {
                        tema.subtemas.forEach(subtema => {
                            if (Array.isArray(subtema.modulosIds)) {
                                const index = subtema.modulosIds.indexOf(moduloId);
                                if (index !== -1) {
                                    subtema.modulosIds[index] = nuevoModuloId;
                                }
                            }
                        });
                    });
                    
                    await setDoc(doc(db, "moodleCourses", `${nuevoId}_${nuevoModuloId}`), nuevoModulo);
                }
            } catch (moduloError) {
            }
        }
        
        // 8. Actualizar curso con nuevas referencias de módulos
        await setDoc(doc(db, "moodleCourses", nuevoId), nuevoCurso);
        
        
    } catch (error) {
        throw new Error(`No se pudo crear copia para ${usuarioDestino.userName}: ${error.message}`);
    }
}

// Función para compartir como colaboración
async function compartirComoColaboracion(curso, usuarioDestino, permisosEditar, permisosCompartir) {
    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            throw new Error("El curso no existe");
        }
        
        const cursoData = cursoSnap.data();
        
        // Inicializar arrays si no existen
        const compartidoCon = cursoData.compartidoCon || [];
        const compartidoConDetalles = cursoData.compartidoConDetalles || [];
        
        // Verificar si ya está compartido
        const yaCompartido = compartidoCon.includes(usuarioDestino.userId);
        
        if (yaCompartido) {
            // Actualizar permisos si ya está compartido
            const nuevosDetalles = compartidoConDetalles.map(detalle => {
                if (detalle.userId === usuarioDestino.userId) {
                    return {
                        ...detalle,
                        permisos: {
                            editar: permisosEditar,
                            compartir: permisosCompartir
                        },
                        fechaModificacion: new Date(),
                        modificadoPor: currentUserId
                    };
                }
                return detalle;
            });
            
            await updateDoc(cursoRef, {
                compartidoConDetalles: nuevosDetalles,
                actualizado: new Date()
            });
            
            mostrarNotificacion(`✅ Permisos actualizados para ${usuarioDestino.userName}`, 'info');
            return;
        }
        
        // Si no está compartido, agregar nuevo
        const nuevoCompartidoCon = [...compartidoCon, usuarioDestino.userId];
        const nuevoCompartidoConDetalles = [
            ...compartidoConDetalles,
            {
                userId: usuarioDestino.userId,
                userName: usuarioDestino.userName,
                userEmail: usuarioDestino.email || '',
                fechaCompartido: new Date(),
                compartidoPor: currentUserId,
                permisos: {
                    editar: permisosEditar,
                    compartir: permisosCompartir
                },
                modo: "colaboracion"
            }
        ];
        
        await updateDoc(cursoRef, {
            compartidoCon: nuevoCompartidoCon,
            compartidoConDetalles: nuevoCompartidoConDetalles,
            actualizado: new Date()
        });
        
        
    } catch (error) {
        throw new Error(`No se pudo compartir con ${usuarioDestino.userName}: ${error.message}`);
    }
}


async function cargarUsuariosParaCompartirCurso() {
    try {
        const listaUsuarios = document.getElementById("listaUsuariosCompartirCurso");
        if (!listaUsuarios) return;

        // Limpiar lista
        listaUsuarios.innerHTML = `
            <div class="text-center py-4 text-gray-500 text-sm">
                <i class="fas fa-spinner fa-spin"></i> Cargando usuarios...
            </div>
        `;

        // Obtener todos los usuarios del sistema
        const usuariosRef = collection(db, "users");
        const usuariosSnap = await getDocs(usuariosRef);
        
        if (usuariosSnap.empty) {
            listaUsuarios.innerHTML = `
                <div class="text-center py-4 text-gray-500 text-sm">
                    No hay usuarios registrados
                </div>
            `;
            return;
        }

        // Obtener información de usuarios con los que YA está compartido
        const cursoCompartiendo = window.cursoCompartiendo;
        let usuariosYaCompartidos = [];
        
        if (cursoCompartiendo && cursoCompartiendo.compartidoConDetalles) {
            usuariosYaCompartidos = cursoCompartiendo.compartidoConDetalles.map(d => ({
                userId: d.userId,
                userName: d.userName,
                permisos: d.permisos || { editar: false, compartir: false }
            }));
        }

        // Filtrar usuarios (excluir al usuario actual)
        const usuarios = [];
        usuariosSnap.forEach(doc => {
            const userData = doc.data();
            if (userData.uid !== currentUserId) {
                // Verificar si ya está compartido con este usuario
                const yaCompartido = usuariosYaCompartidos.find(u => u.userId === userData.uid);
                
                usuarios.push({
                    id: doc.id,
                    uid: userData.uid,
                    nombre: userData.displayName || userData.email || "Usuario",
                    email: userData.email || "",
                    yaCompartido: !!yaCompartido,
                    permisos: yaCompartido ? yaCompartido.permisos : null
                });
            }
        });

        // Renderizar lista
        let html = '';
        
        // Primero mostrar usuarios con los que YA está compartido
        const usuariosCompartidos = usuarios.filter(u => u.yaCompartido);
        const usuariosNoCompartidos = usuarios.filter(u => !u.yaCompartido);
        
        if (usuariosCompartidos.length > 0) {
            html += `
                <div class="mb-3">
                    <p class="text-xs font-medium text-green-600 mb-2">
                        <i class="fas fa-check-circle mr-1"></i>
                        Ya compartido con:
                    </p>
                    <div class="space-y-1">
            `;
            
            usuariosCompartidos.forEach(user => {
                const permisosTexto = user.permisos ? 
                    (user.permisos.editar ? 'Editable' : 'Solo lectura') : 
                    'Solo lectura';
                
                html += `
                    <div class="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-foreground">${user.nombre}</p>
                            <p class="text-xs text-muted-foreground">${user.email}</p>
                            <span class="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                <i class="fas fa-check mr-1"></i>${permisosTexto}
                            </span>
                        </div>
                        <div class="flex gap-2">
                            <button class="text-xs text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 btn-dejar-compartir" 
                                    data-userid="${user.uid}"
                                    data-username="${user.nombre}"
                                    title="Dejar de compartir">
                                <i class="fas fa-user-slash"></i>
                            </button>
                            <button class="text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 btn-editar-permisos" 
                                    data-userid="${user.uid}"
                                    data-username="${user.nombre}"
                                    title="Editar permisos">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `</div></div>`;
            
            if (usuariosNoCompartidos.length > 0) {
                html += `<div class="border-t pt-3 mt-3"></div>`;
            }
        }
        
        // Luego mostrar usuarios disponibles para compartir
        if (usuariosNoCompartidos.length > 0) {
            html += `
                <p class="text-xs text-muted-foreground mb-2">
                    <i class="fas fa-plus-circle mr-1"></i>
                    Selecciona uno o varios usuarios para compartir:
                </p>
            `;
            
            usuariosNoCompartidos.forEach(user => {
                html += `
                    <label class="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer">
                        <input type="checkbox" 
                               class="user-checkbox"
                               data-userid="${user.uid}"
                               data-username="${user.nombre}"
                               data-useremail="${user.email}">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-foreground">${user.nombre}</p>
                            <p class="text-xs text-muted-foreground">${user.email}</p>
                        </div>
                    </label>
                `;
            });
        } else {
            // 🔥 CORRECCIÓN: Mensaje cuando no hay usuarios nuevos disponibles
            html += `
                <div class="text-center py-4">
                    <i class="fas fa-users text-gray-400 text-2xl mb-2"></i>
                    <p class="text-sm text-gray-600">No hay más usuarios disponibles para compartir</p>
                    <p class="text-xs text-gray-400 mt-1">Todos los usuarios ya tienen acceso al curso</p>
                </div>
            `;
        }

        listaUsuarios.innerHTML = html;

        // Añadir eventos para los botones
        document.querySelectorAll('.btn-dejar-compartir').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const userId = e.currentTarget.dataset.userid;
                const userName = e.currentTarget.dataset.username;
                
                if (confirm(`¿Dejar de compartir el curso con ${userName}?`)) {
                    await dejarDeCompartirCurso(userId);
                }
            });
        });

        document.querySelectorAll('.btn-editar-permisos').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const userId = e.currentTarget.dataset.userid;
                const userName = e.currentTarget.dataset.username;
                
                await mostrarModalEditarPermisos(userId, userName);
            });
        });

    } catch (error) {
        document.getElementById("listaUsuariosCompartirCurso").innerHTML = `
            <div class="text-center py-4 text-red-500 text-sm">
                <i class="fas fa-exclamation-triangle mr-1"></i>
                Error al cargar usuarios
            </div>
        `;
    }
}

// Agrega esta función para mostrar cuántos usuarios están seleccionados
function actualizarContadorSeleccion() {
    const checkboxes = document.querySelectorAll('#listaUsuariosCompartirCurso input[type="checkbox"]:checked');
    const contadorElement = document.getElementById('contadorSeleccion');
    
    if (!contadorElement) {
        // Crear elemento si no existe
        const nuevoContador = document.createElement('div');
        nuevoContador.id = 'contadorSeleccion';
        nuevoContador.className = 'text-xs text-blue-600 mt-2 mb-3';
        
        const modalFooter = document.querySelector('#modalCompartirCurso .modal-footer');
        if (modalFooter) {
            modalFooter.insertBefore(nuevoContador, modalFooter.firstChild);
        }
    }
    
    const contador = document.getElementById('contadorSeleccion');
    if (contador) {
        if (checkboxes.length > 0) {
            contador.innerHTML = `<i class="fas fa-check-circle mr-1"></i>${checkboxes.length} usuario(s) seleccionado(s)`;
            contador.classList.remove('hidden');
        } else {
            contador.classList.add('hidden');
        }
    }
}

// En cargarUsuariosParaCompartirCurso, añade eventos a los checkboxes:
function agregarEventosCheckboxes() {
    document.querySelectorAll('.user-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', actualizarContadorSeleccion);
    });
}

// Llama a esta función después de renderizar la lista en cargarUsuariosParaCompartirCurso:
// En la parte final de cargarUsuariosParaCompartirCurso:
setTimeout(() => {
    agregarEventosCheckboxes();
    actualizarContadorSeleccion();
}, 100);

// Función para mostrar modal de edición de permisos
async function mostrarModalEditarPermisos(userId, userName) {
    const curso = window.cursoCompartiendo;
    if (!curso) return;
    
    // Obtener permisos actuales
    const detalleUsuario = curso.compartidoConDetalles?.find(d => d.userId === userId);
    const permisosActuales = detalleUsuario?.permisos || { editar: false, compartir: false };
    
    // Crear modal de edición de permisos
    const modalHTML = `
        <div id="modalEditarPermisos" class="modal fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000]">
            <div class="bg-card border-border w-[90%] max-w-md rounded-xl shadow-2xl p-6">
                <h3 class="text-lg font-semibold mb-4 text-foreground">Editar permisos</h3>
                
                <div class="mb-4">
                    <p class="text-sm text-muted-foreground mb-2">
                        Usuario: <span class="text-foreground font-semibold">${userName}</span>
                    </p>
                    <p class="text-xs text-muted-foreground mb-4">
                        Curso: <span class="text-foreground">${curso.nombre}</span>
                    </p>
                    
                    <div class="space-y-3 p-3 bg-accent rounded-md border border-border">
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   id="checkEditarPermisos" 
                                   ${permisosActuales.editar ? 'checked' : ''}
                                   class="mr-2">
                            <span class="text-sm text-foreground">Permitir edición</span>
                        </label>
                        
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   id="checkCompartirPermisos" 
                                   ${permisosActuales.compartir ? 'checked' : ''}
                                   class="mr-2">
                            <span class="text-sm text-foreground">Permitir compartir con otros</span>
                        </label>
                    </div>
                </div>
                
                <div class="flex justify-end gap-3 mt-6">
                    <button id="btnCancelarEditarPermisos"
                            class="px-3 py-1 text-sm bg-accent text-accent-foreground rounded hover:bg-accent/80 transition-colors">
                        Cancelar
                    </button>
                    
                    <button id="btnGuardarEditarPermisos"
                            class="px-4 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
                        Guardar cambios
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Eliminar modal anterior si existe
    const modalAnterior = document.getElementById('modalEditarPermisos');
    if (modalAnterior) modalAnterior.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Configurar eventos
    document.getElementById('btnCancelarEditarPermisos').onclick = () => {
        document.getElementById('modalEditarPermisos').remove();
    };
    
    document.getElementById('btnGuardarEditarPermisos').onclick = async () => {
        const editar = document.getElementById('checkEditarPermisos').checked;
        const compartir = document.getElementById('checkCompartirPermisos').checked;
        
        await actualizarPermisosUsuario(userId, editar, compartir);
        document.getElementById('modalEditarPermisos').remove();
    };
}

// Función para actualizar permisos de usuario
async function actualizarPermisosUsuario(userId, puedeEditar, puedeCompartir) {
    const curso = window.cursoCompartiendo;
    if (!curso || !currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            mostrarNotificacion("El curso no existe", "error");
            return;
        }
        
        const cursoData = cursoSnap.data();
        const compartidoConDetalles = cursoData.compartidoConDetalles || [];
        
        // Actualizar los permisos del usuario
        const nuevosDetalles = compartidoConDetalles.map(detalle => {
            if (detalle.userId === userId) {
                return {
                    ...detalle,
                    permisos: {
                        editar: puedeEditar,
                        compartir: puedeCompartir
                    },
                    fechaModificacion: new Date(),
                    modificadoPor: currentUserId
                };
            }
            return detalle;
        });
        
        // Actualizar en Firestore
        await updateDoc(cursoRef, {
            compartidoConDetalles: nuevosDetalles,
            actualizado: new Date()
        });
        
        // Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === curso.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].compartidoConDetalles = nuevosDetalles;
        }
        
        // Si el usuario actual está viendo el curso y perdió permisos, refrescar
        if (cursoDocId === curso.id && currentUserId === userId && !puedeEditar) {
            // Recargar el curso para reflejar los nuevos permisos
            await seleccionarCurso(curso.id);
        }
        
        mostrarNotificacion("✅ Permisos actualizados correctamente", 'success');
        
        // Recargar la lista de usuarios en el modal
        await cargarUsuariosParaCompartirCurso();
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
}


// Función para dejar de compartir un curso con un usuario
async function dejarDeCompartirCurso(userId) {
    const curso = window.cursoCompartiendo;
    if (!curso || !currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            mostrarNotificacion("El curso no existe", "error");
            return;
        }
        
        const cursoData = cursoSnap.data();
        
        // Filtrar el usuario de los arrays de compartir
        const nuevoCompartidoCon = (cursoData.compartidoCon || []).filter(uid => uid !== userId);
        const nuevoCompartidoConDetalles = (cursoData.compartidoConDetalles || []).filter(
            detalle => detalle.userId !== userId
        );
        
        // Actualizar en Firestore
        await updateDoc(cursoRef, {
            compartidoCon: nuevoCompartidoCon,
            compartidoConDetalles: nuevoCompartidoConDetalles,
            actualizado: new Date()
        });
        
        // Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === curso.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].compartidoCon = nuevoCompartidoCon;
            cursosUsuario[cursoIndex].compartidoConDetalles = nuevoCompartidoConDetalles;
        }
        
        mostrarNotificacion("✅ Se dejó de compartir el curso", 'success');
        
        // Recargar la lista de usuarios en el modal
        await cargarUsuariosParaCompartirCurso();
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
}

// Función para actualizar permisos de un usuario
window.actualizarPermisoUsuario = async function(userId, tipoPermiso, valor) {
    const curso = window.cursoCompartiendo;
    
    if (!curso || !userId) return;
    
    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) return;
        
        const cursoData = cursoSnap.data();
        const compartidoConDetalles = cursoData.compartidoConDetalles || [];
        
        // Buscar y actualizar los permisos del usuario
        const nuevosDetalles = compartidoConDetalles.map(detalle => {
            if (detalle.userId === userId) {
                return {
                    ...detalle,
                    permisos: {
                        ...detalle.permisos,
                        [tipoPermiso]: valor
                    },
                    ultimaModificacion: new Date()
                };
            }
            return detalle;
        });
        
        await updateDoc(cursoRef, {
            compartidoConDetalles: nuevosDetalles,
            actualizado: new Date()
        });
        
        // Mostrar notificación
        const tipoTexto = tipoPermiso === 'editar' ? 'editar' : 'compartir';
        const accion = valor ? 'concedido' : 'revocado';
        mostrarNotificacion(`✅ Permiso para ${tipoTexto} ${accion}`, 'success');
        
    } catch (error) {
        mostrarNotificacion(`❌ Error actualizando permiso`, 'error');
        
        // Revertir el checkbox en la UI
        const checkbox = document.querySelector(`.permiso-${tipoPermiso}[data-userid="${userId}"]`);
        if (checkbox) {
            checkbox.checked = !valor;
        }
    }
};



// Abrir modal
document.getElementById("btnNuevoCurso").addEventListener("click", () => {
    inputNombreCurso.value = "";
    modalCrearCurso.classList.remove("hidden");
    modalCrearCurso.classList.add("flex");

    setTimeout(() => inputNombreCurso.focus(), 100);
});

// Cancelar
btnCancelarCrearCurso.addEventListener("click", () => {
    modalCrearCurso.classList.add("hidden");
    modalCrearCurso.classList.remove("flex");
});

let creandoCurso = false;

// Crear curso
btnCrearCurso.addEventListener("click", async () => {
    const nombre = inputNombreCurso.value.trim();
    if (!nombre) {
        inputNombreCurso.classList.add("border-red-500");
        setTimeout(() => inputNombreCurso.classList.remove("border-red-500"), 1000);
        return;
    }

    // 🔥 CORRECCIÓN CRÍTICA: Evitar múltiples ejecuciones
    if (creandoCurso) {
        return;
    }
    
    if (btnCrearCurso.disabled) {
        return;
    }
    
    // Guardar el estado original
    const originalBtnText = btnCrearCurso.innerHTML;
    
    // Bloquear
    creandoCurso = true;
    btnCrearCurso.disabled = true;
    btnCrearCurso.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    btnCrearCurso.classList.add('cursor-not-allowed', 'opacity-75');

    try {
        // 🔥 VERIFICACIÓN ADICIONAL: Revisar si ya existe curso con mismo nombre para este usuario
        const cursoExistente = cursosUsuario.find(c => 
            c.nombre.toLowerCase() === nombre.toLowerCase() && 
            c.userId === currentUserId
        );
        
        if (cursoExistente) {
            throw new Error(`Ya tienes un curso llamado "${nombre}". Usa un nombre diferente.`);
        }

        const nuevoId = crypto.randomUUID();
        

        const nuevoCurso = {
            cursoId: nuevoId,
            id: nuevoId,
            nombre: nombre,
            descripcion: "",
            userId: currentUserId,
            creado: new Date(),
            temas: [],
            actualizado: new Date(),
            compartidoCon: [],
            compartidoConDetalles: []
        };

        // 🔥 Verificar que el curso no exista ya (doble verificación)
        const cursoRef = doc(db, "moodleCourses", nuevoId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (cursoSnap.exists()) {
            throw new Error("Error inesperado: El ID del curso ya existe. Intenta nuevamente.");
        }

        // 1. Guardar en Firebase
        await setDoc(cursoRef, nuevoCurso);
        
        // 2. Cerrar modal inmediatamente
        modalCrearCurso.classList.add("hidden");
        modalCrearCurso.classList.remove("flex");
        
        // 3. Limpiar el input
        inputNombreCurso.value = "";
        
        // 4. Recargar la lista
        await cargarCursosUsuario();
        
        // 5. Esperar un momento y seleccionar el curso creado
        setTimeout(() => {
            seleccionarCurso(nuevoId);
        }, 500);
        
        // 6. Mostrar notificación de éxito
        mostrarNotificacion(`Curso "${nombre}" creado exitosamente`, 'success');
        
    } catch (err) {
        
        // 🔥 Mensajes de error específicos
        let errorMessage = "Error al crear el curso";
        if (err.code === 'permission-denied') {
            errorMessage = "No tienes permisos para crear cursos";
        } else if (err.code === 'resource-exhausted') {
            errorMessage = "Límite de escrituras excedido. Intenta más tarde";
        } else if (err.message.includes("ya tienes") || err.message.includes("ya existe")) {
            errorMessage = err.message;
        } else {
            errorMessage = `Error: ${err.message}`;
        }
        
        mostrarNotificacion(errorMessage, 'error', true);
        
        // 🔥 Mantener el modal abierto si hay error de nombre duplicado
        if (!err.message.includes("ya tienes")) {
            modalCrearCurso.classList.add("hidden");
            modalCrearCurso.classList.remove("flex");
        }
        
    } finally {
        // 🔥 Re-habilitar el botón después de un tiempo
        setTimeout(() => {
            btnCrearCurso.disabled = false;
            btnCrearCurso.innerHTML = originalBtnText;
            btnCrearCurso.classList.remove('cursor-not-allowed', 'opacity-75');
            creandoCurso = false;
        }, 1500);
    }
});


// Función para limpiar todas las suscripciones activas
function limpiarTodasSuscripciones() {
    // Suscripción del curso
    if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
        window.cursoSnapshotUnsubscribe();
        window.cursoSnapshotUnsubscribe = null;
    }
    
    // Suscripciones de módulos
    if (window.suscripcionesModulos) {
        Object.values(window.suscripcionesModulos).forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        window.suscripcionesModulos = {};
    }
    
    // Limpiar otros listeners si existen
    if (window.cursoSeleccionadoListener) {
        window.cursoSeleccionadoListener.remove();
        window.cursoSeleccionadoListener = null;
    }
}

// Llamar esta función cuando se cierre un curso o cambie de página
document.addEventListener('beforeunload', limpiarTodasSuscripciones);

let seleccionandoCurso = false;

async function seleccionarCurso(id) {
    // 🔥 VERIFICACIÓN DE SEGURIDAD
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return;
    }
    
    // 🔥 EVITAR EJECUCIÓN MÚLTIPLE
    if (seleccionandoCurso) {
        return;
    }
    
    // 🔥 Si ya es el curso activo, no hacer nada
    if (cursoDocId === id) {
        return;
    }
    
    seleccionandoCurso = true;

    try {
        // 🔥 LIMPIAR SUSCRIPCIONES ANTERIORES (UNA SOLA VEZ)
        if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
            window.cursoSnapshotUnsubscribe();
            window.cursoSnapshotUnsubscribe = null;
        }
        
        // Limpiar suscripciones de módulos
        limpiarSuscripcionesModulos();

        
        // Buscar el curso en la lista local
        let cursoLocal = cursosUsuario.find(c => c.id === id);
        
        if (!cursoLocal) {
            // Intentar cargar desde Firebase
            try {
                const cursoRef = doc(db, "moodleCourses", id);
                const cursoSnap = await getDoc(cursoRef);
                
                if (!cursoSnap.exists()) {
                    mostrarNotificacion("El curso no existe o ha sido eliminado", "error");
                    
                    // Recargar cursos y salir
                    await cargarCursosUsuario();
                    return;
                }
                
                const cursoData = cursoSnap.data();
                
                // Verificar acceso
                const esPropietario = cursoData.userId === currentUserId;
                const estaCompartido = cursoData.compartidoCon && 
                                      cursoData.compartidoCon.includes(currentUserId);
                
                if (!esPropietario && !estaCompartido) {
                    mostrarNotificacion("No tienes acceso a este curso", "error");
                    return;
                }
                
                // Determinar permisos
                let permisosUsuario = { editar: false, compartir: false };
                
                if (!esPropietario && cursoData.compartidoConDetalles) {
                    const detalleUsuario = cursoData.compartidoConDetalles.find(
                        detalle => detalle.userId === currentUserId
                    );
                    
                    if (detalleUsuario) {
                        permisosUsuario = {
                            editar: detalleUsuario.permisos?.editar || false,
                            compartir: detalleUsuario.permisos?.compartir || false
                        };
                    }
                }
                
                // Crear objeto curso
                cursoLocal = {
                    id: id,
                    cursoId: cursoData.cursoId || id,
                    nombre: cursoData.nombre || "Curso sin nombre",
                    descripcion: cursoData.descripcion || "",
                    userId: cursoData.userId,
                    creado: cursoData.creado || new Date(),
                    temas: Array.isArray(cursoData.temas) ? cursoData.temas : [],
                    esPropio: esPropietario,
                    permisos: permisosUsuario,
                    tipo: esPropietario ? "propio" : "compartido"
                };
                
                // Agregar a la lista local
                const existe = cursosUsuario.some(c => c.id === id);
                if (!existe) {
                    cursosUsuario.push(cursoLocal);
                    renderListaCursos();
                }
                
            } catch (firebaseError) {
                mostrarNotificacion("Error al cargar el curso desde la base de datos", "error");
                return;
            }
        }
        
        if (!cursoLocal) {
            mostrarNotificacion("No se pudo cargar el curso", "error");
            return;
        }
        
        // 🔥 VERIFICACIÓN DE PERMISOS
        const esCursoPropio = cursoLocal.esPropio;
        const tienePermisoEditar = esCursoPropio || cursoLocal.permisos?.editar === true;
        
        // 🔥 CORRECCIÓN: Solo mostrar advertencia una vez al abrir (no confirm)
        if (!tienePermisoEditar) {
        }
        
        // Limpiar estados activos
        limpiarEstadosActivos();
        
        // Asignar curso a variables globales
        curso = { ...cursoLocal };
        cursoDocId = id;
        window.curso = curso;
        
        // Asegurar estructura válida
        curso.temas = Array.isArray(curso.temas) ? curso.temas : [];
        
        
        // Guardar selección en LocalStorage
        localStorage.setItem("cursoSeleccionado", id);
        
        // Actualizar UI de lista de cursos
        document.querySelectorAll('.curso-item').forEach(item => {
            item.classList.remove('active', 'highlight-pulse');
        });
        
        const cursoItemElement = document.querySelector(`.curso-item[data-id="${id}"]`);
        if (cursoItemElement) {
            cursoItemElement.classList.add('active', 'highlight-pulse');
            
            setTimeout(() => {
                cursoItemElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest'
                });
            }, 100);
        }
        
        // Actualizar información del curso en la UI
        const cursoNombreElement = document.getElementById("cursoSeleccionadoNombre");
        if (cursoNombreElement) {
            cursoNombreElement.innerText = curso.nombre;
            
            // Añadir indicador de modo solo si es de solo lectura
            if (!tienePermisoEditar) {
                const modoElement = document.createElement("span");
                modoElement.className = "ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full";
                modoElement.textContent = "Solo lectura";
                modoElement.id = "modoLecturaIndicator";
                
                // Remover indicador anterior si existe
                const indicadorAnterior = document.getElementById("modoLecturaIndicator");
                if (indicadorAnterior) indicadorAnterior.remove();
                
                cursoNombreElement.appendChild(modoElement);
            }
        }
        
        // Mostrar sidebar de temas
        const sidebarTemas = document.getElementById("sidebarTemas");
        if (sidebarTemas) {
            sidebarTemas.classList.remove("hidden");
            
            // Aplicar clase de modo lectura si corresponde
            if (!tienePermisoEditar) {
                sidebarTemas.classList.add('readonly-mode');
            } else {
                sidebarTemas.classList.remove('readonly-mode');
            }
        }
        
        // Configurar botón de añadir tema según permisos
        const btnAddTema = document.getElementById("btnAddTema");
        if (btnAddTema) {
            btnAddTema.disabled = !tienePermisoEditar;
            btnAddTema.title = tienePermisoEditar ? "Añadir nuevo tema" : "No tienes permisos para añadir temas";
            
            if (!tienePermisoEditar) {
                btnAddTema.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        
        // Renderizar temas
        renderTemas();
        
        // Configurar editor según permisos
        const contenidoEditor = document.getElementById('contenidoEditor');
        if (contenidoEditor) {
            if (!tienePermisoEditar) {
                contenidoEditor.innerHTML = `
                    <div class="empty-state text-center py-10">
                        <i class="fas fa-eye text-3xl text-yellow-500 mb-2"></i>
                        <h3 class="text-sm font-semibold text-gray-700 mb-1">Modo Solo Lectura</h3>
                        <p class="text-xs text-gray-500 mb-3">
                            Este curso ha sido compartido contigo en modo solo lectura.
                        </p>
                        <p class="text-xs text-gray-400">
                            Selecciona un subtema para ver el contenido.
                        </p>
                    </div>
                `;
                
                // 🔥 CORRECCIÓN: Permitir contenido pero deshabilitar edición
                contenidoEditor.classList.add('readonly-mode');
            } else {
                // Modo edición normal
                contenidoEditor.innerHTML = `
                    <div class="empty-state text-center py-10 text-gray-400">
                        <i class="fas fa-layer-group text-3xl mb-2"></i>
                        <p class="text-sm">Selecciona un subtema para comenzar</p>
                    </div>
                `;
                contenidoEditor.classList.remove('readonly-mode');
            }
        }
        
        // 🔥 SUSCRIPCIÓN A CAMBIOS SOLO PARA CURSOS COMPARTIDOS
        if (!esCursoPropio) {
            // Cancelar suscripción anterior si existe
            if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
                window.cursoSnapshotUnsubscribe();
            }
            
            // Suscribirse a cambios en este curso
            const unsubscribe = suscribirACambiosCurso(id);
            
            if (unsubscribe) {
                window.cursoSnapshotUnsubscribe = unsubscribe;
                window.suscripcionCursoId = id;
            } else {
            }
        } else if (window.cursoSnapshotUnsubscribe) {
            // Si es curso propio pero hay suscripción anterior, limpiarla
            window.cursoSnapshotUnsubscribe();
            window.cursoSnapshotUnsubscribe = null;
            window.suscripcionCursoId = null;
        }

        // Forzar actualización de la lista de cursos
        setTimeout(() => {
            renderListaCursos();
        }, 300);
        
        
    } catch (error) {
        
        // 🔥 MEJOR MANEJO DE ERRORES
        let errorMessage = "Error al seleccionar el curso";
        
        if (error.code === 'permission-denied') {
            errorMessage = "No tienes permiso para acceder a este curso";
        } else if (error.code === 'not-found') {
            errorMessage = "El curso no existe o ha sido eliminado";
            // Recargar lista de cursos
            await cargarCursosUsuario();
        }
        
        mostrarNotificacion(errorMessage, "error");
        
        // 🔥 Limpiar UI solo en caso de error
        limpiarUIError();
        
    } finally {
        // 🔥 DESBLOQUEAR siempre
        seleccionandoCurso = false;
    }
}


function mostrarNotificacion(mensaje, tipo = 'info', esPersistente = false) {
    // 🔥 Evitar notificaciones duplicadas en ventana de 1 segundo
    if (window.ultimaNotificacion && 
        Date.now() - window.ultimaNotificacion < 1000 && 
        window.ultimoMensajeNotificacion === mensaje) {
        return;
    }
    
    window.ultimaNotificacion = Date.now();
    window.ultimoMensajeNotificacion = mensaje;
    
    const tipos = {
        success: {
            clase: 'bg-green-100 border-green-400 text-green-700',
            icono: 'fa-check-circle'
        },
        error: {
            clase: 'bg-red-100 border-red-400 text-red-700',
            icono: 'fa-exclamation-circle'
        },
        info: {
            clase: 'bg-blue-100 border-blue-400 text-blue-700',
            icono: 'fa-info-circle'
        },
        warning: {
            clase: 'bg-yellow-100 border-yellow-400 text-yellow-700',
            icono: 'fa-exclamation-triangle'
        }
    };
    
    const config = tipos[tipo] || tipos.info;
    
    const notificacion = document.createElement('div');
    notificacion.className = `fixed top-4 right-4 p-4 rounded-lg border ${config.clase} shadow-lg z-[1000] transform transition-all duration-300 translate-x-full max-w-sm`;
    notificacion.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas ${config.icono}"></i>
            <p class="text-sm font-medium">${mensaje}</p>
        </div>
    `;
    
    document.body.appendChild(notificacion);
    
    // Animación de entrada
    setTimeout(() => {
        notificacion.classList.remove('translate-x-full');
        notificacion.classList.add('translate-x-0');
    }, 10);
    
    // Auto-eliminar
    const tiempo = esPersistente ? 5000 : 3000;
    setTimeout(() => {
        notificacion.classList.remove('translate-x-0');
        notificacion.classList.add('translate-x-full');
        setTimeout(() => {
            if (notificacion.parentNode) {
                notificacion.parentNode.removeChild(notificacion);
            }
        }, 300);
    }, tiempo);
}



// Función auxiliar para limpiar UI en caso de error
function limpiarUIError() {
    
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.add("hidden");
        sidebarTemas.classList.remove('readonly-mode');
    }
    
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.innerHTML = `
            <div class="empty-state text-center py-10 text-gray-400">
                <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                <p class="text-sm">Error al cargar el curso</p>
                <p class="text-xs mt-2">Selecciona otro curso o recarga la página</p>
            </div>
        `;
        contenidoEditor.classList.remove('readonly-mode');
    }
    
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = true;
        btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    // Limpiar variables globales
    cursoDocId = null;
    curso = null;
    temaActivo = null;
    subtemaActivo = null;
    
    // Limpiar localStorage relacionado
    localStorage.removeItem("temaAbierto");
    localStorage.removeItem("subtemaAbierto");
    localStorage.removeItem("moduloActivo");
    
    // Actualizar nombre del curso en UI
    const cursoNombreElement = document.getElementById("cursoSeleccionadoNombre");
    if (cursoNombreElement) {
        cursoNombreElement.innerText = "Selecciona un curso";
        // Remover indicador de modo lectura
        const indicador = document.getElementById("modoLecturaIndicator");
        if (indicador) indicador.remove();
    }
}

// Función para suscribirse a cambios en tiempo real (si no la tienes)
function suscribirACambiosCurso(cursoId) {
    if (!cursoId || !db) {
        return null;
    }
    
    try {
        const cursoRef = doc(db, "moodleCourses", cursoId);
        
        
        const unsubscribe = onSnapshot(cursoRef, 
            async (snapshot) => {
                // 🔥 CORRECCIÓN: Verificar que el curso aún esté seleccionado
                if (cursoDocId !== cursoId) {
                    return;
                }
                
                if (!snapshot.exists()) {
                    mostrarNotificacion("El curso ha sido eliminado", "warning");
                    
                    // Cerrar el curso
                    if (cursoDocId === cursoId) {
                        limpiarUIError();
                        cargarCursosUsuario();
                    }
                    return;
                }
                
                const data = snapshot.data();
                
                // 🔥 CORRECCIÓN IMPORTANTE: Evitar loops cuando se pierden permisos
                // Si el usuario actual NO es el propietario
                const esPropietario = data.userId === currentUserId;
                
                if (!esPropietario && data.compartidoConDetalles) {
                    const detalleUsuario = data.compartidoConDetalles.find(
                        detalle => detalle.userId === currentUserId
                    );
                    
                    // Si el usuario ya no está en la lista compartida
                    if (!detalleUsuario) {
                        mostrarNotificacion("Se ha revocado tu acceso a este curso", "warning", true);
                        
                        // Limpiar UI sin volver a llamar seleccionarCurso
                        limpiarUIError();
                        await cargarCursosUsuario();
                        return;
                    }
                    
                    // Si tiene permisos actualizados
                    const nuevosPermisos = {
                        editar: detalleUsuario.permisos?.editar || false,
                        compartir: detalleUsuario.permisos?.compartir || false
                    };
                    
                    // Actualizar permisos en la lista local
                    const cursoIndex = cursosUsuario.findIndex(c => c.id === cursoId);
                    if (cursoIndex !== -1) {
                        cursosUsuario[cursoIndex].permisos = nuevosPermisos;
                    }
                    
                    // 🔥 CORRECCIÓN: Solo refrescar si realmente cambió el estado de edición
                    const cursoActual = cursosUsuario.find(c => c.id === cursoId);
                    if (cursoActual) {
                        const teniaEdicionAnterior = curso.permisos?.editar === true;
                        const tieneEdicionAhora = nuevosPermisos.editar === true;
                        
                        if (teniaEdicionAnterior && !tieneEdicionAhora) {
                            // Actualizar UI sin recargar completamente
                            actualizarUIParaModoLectura();
                        } else if (!teniaEdicionAnterior && tieneEdicionAhora) {
                            actualizarUIParaModoEdicion();
                        }
                        
                        // Actualizar permisos en el objeto curso global
                        if (curso.permisos) {
                            curso.permisos.editar = nuevosPermisos.editar;
                            curso.permisos.compartir = nuevosPermisos.compartir;
                        }
                    }
                }
                
                // Resto del código para actualizar contenido en tiempo real...
                // (mantener el código existente para temas, módulos, etc.)
                
                // 🔥 NUEVO: Actualizar contenido de módulos en tiempo real
                if (cursoDocId === cursoId && data) {
                    // ... (código existente)
                }
                
                // Actualizar datos del curso si es necesario
                if (cursoDocId === cursoId) {
                    // ... (código existente)
                }
            }, 
            (error) => {
                
                // Manejar errores específicos
                if (error.code === 'permission-denied') {
                    mostrarNotificacion("No tienes permiso para ver cambios en tiempo real", "warning", true);
                }
            }
        );
        
        return unsubscribe;
        
    } catch (error) {
        return null;
    }
}

// Función para actualizar UI a modo lectura sin recargar completamente
function actualizarUIParaModoLectura() {
    
    // Actualizar botón de añadir tema
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = true;
        btnAddTema.classList.add('opacity-50', 'cursor-not-allowed');
        btnAddTema.title = "No tienes permisos para añadir temas";
    }
    
    // Actualizar sidebar
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.add('readonly-mode');
    }
    
    // Actualizar editor
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.classList.add('readonly-mode');
        
        // Deshabilitar todos los botones de edición
        contenidoEditor.querySelectorAll('button, .icon-btn').forEach(btn => {
            if (btn.id !== 'btnDescargarWord') {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        });
    }
    
    // Mostrar notificación una sola vez
    mostrarNotificacion("Se han revocado tus permisos de edición. Ahora estás en modo solo lectura.", "warning", true);
}

// Función para actualizar UI a modo edición
function actualizarUIParaModoEdicion() {
    
    // Actualizar botón de añadir tema
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = false;
        btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
        btnAddTema.title = "Añadir nuevo tema";
    }
    
    // Actualizar sidebar
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.remove('readonly-mode');
    }
    
    // Actualizar editor
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.classList.remove('readonly-mode');
        
        // Habilitar todos los botones de edición
        contenidoEditor.querySelectorAll('button, .icon-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        });
    }
    
    mostrarNotificacion("Tienes permisos de edición para este curso.", "success", true);
}

let suscripcionesModulos = {};

function suscribirCambiosModulo(moduloId) {
    if (!moduloId || !curso || !curso.id) return;
    
    // Ya tenemos suscripción para este módulo
    if (suscripcionesModulos[moduloId]) return;
    
    // Crear ID compuesto para Firestore
    const moduloDocId = moduloId.includes('_') ? moduloId : `${curso.id}_${moduloId}`;
    const moduloRef = doc(db, "moodleCourses", moduloDocId);
    
    
    const unsubscribe = onSnapshot(moduloRef,
        (snapshot) => {
            if (!snapshot.exists()) {
                // Eliminar suscripción
                if (suscripcionesModulos[moduloId]) {
                    suscripcionesModulos[moduloId]();
                    delete suscripcionesModulos[moduloId];
                }
                return;
            }
            
            const data = snapshot.data();
            if (!data) return;
            
            // 🔥 ACTUALIZAR CONTENIDO EN TIEMPO REAL
            const contenidoDiv = document.getElementById(`contenido-${moduloId}`);
            if (contenidoDiv) {
                const contenidoRenderizado = renderizarContenidoModulo(data.contenido || "");
                if (contenidoDiv.innerHTML === contenidoRenderizado) return;

                contenidoDiv.innerHTML = contenidoRenderizado;
                
                // Reactivar menú contextual
                setTimeout(() => {
                    if (typeof activarAccionesEnParrafos === 'function') {
                        activarAccionesEnParrafos();
                    }
                }, 100);
                
                // Mostrar notificación
                mostrarNotificacion(`Módulo "${data.nombre || 'sin nombre'}" actualizado`, 'info');
            }
        },
        (error) => {
        }
    );
    
    suscripcionesModulos[moduloId] = unsubscribe;
}

// Función para limpiar todas las suscripciones de módulos
function limpiarSuscripcionesModulos() {
    Object.values(suscripcionesModulos).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    suscripcionesModulos = {};
}



function verificarPermisosAccion(accion, cursoId) {
    const curso = cursosUsuario.find(c => c.id === cursoId);
    if (!curso) return false;
    
    // Si es propio, tiene todos los permisos
    if (curso.esPropio) return true;
    
    // Verificar permisos específicos
    switch(accion) {
        case 'editar':
            return curso.permisos?.editar === true;
        case 'compartir':
            return curso.permisos?.compartir === true;
        case 'eliminar':
            return curso.esPropio; // Solo propietario puede eliminar
        default:
            return false;
    }
}


const modalEditarCurso = document.getElementById("modalEditarCurso");
const inputEditarNombreCurso = document.getElementById("inputEditarNombreCurso");

let cursoEditando = null;

// Cancelar
document.getElementById("btnCancelarEditarCurso").onclick = () => {
    modalEditarCurso.classList.add("hidden");
    modalEditarCurso.classList.remove("flex");
};

// Guardar
document.getElementById("btnConfirmarEditarCurso").onclick = async () => {
    const nuevoNombre = inputEditarNombreCurso.value.trim();
    if (!nuevoNombre || !cursoEditando) return;

    try {
        // 1. Verificar que el documento existe antes de actualizar
        const cursoRef = doc(db, "moodleCourses", cursoEditando.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            alert("Error: El curso no existe en la base de datos.");
            
            // Recargar lista de cursos
            await cargarCursosUsuario();
            modalEditarCurso.classList.add("hidden");
            return;
        }

        // 2. Actualizar en Firebase
        await updateDoc(cursoRef, { nombre: nuevoNombre });

        // 3. Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === cursoEditando.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].nombre = nuevoNombre;
        }

        // 4. Si el curso editado es el que está seleccionado, actualizar la UI
        if (cursoDocId === cursoEditando.id) {
            curso.nombre = nuevoNombre;
            document.getElementById("cursoSeleccionadoNombre").innerText = nuevoNombre;
        }

        // 5. Cerrar modal
        modalEditarCurso.classList.add("hidden");
        modalEditarCurso.classList.remove("flex");

        // 6. Actualizar la lista de cursos
        renderListaCursos();

        alert("Curso editado exitosamente.");

    } catch (err) {
        
        if (err.code === 'not-found') {
            alert("Error: El curso no existe. Se ha eliminado o no se pudo encontrar.");
            // Recargar lista de cursos
            await cargarCursosUsuario();
        } else if (err.code === 'permission-denied') {
            alert("Error: No tienes permiso para editar este curso.");
        } else {
            alert("Error al editar el curso: " + err.message);
        }
        
        modalEditarCurso.classList.add("hidden");
        modalEditarCurso.classList.remove("flex");
    }
};





/* GUARDAR AUTOMÁTICAMENTE EN FIREBASE */
/* GUARDAR AUTOMÁTICAMENTE EN FIREBASE */
window.guardarCursoFirebase = async function () {
    if (!cursoDocId || !curso) {
        return false;
    }
    
    try {
        // Verificar permisos para cursos compartidos
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        if (!cursoActual) {
            return false;
        }
        
        // Verificar permisos
        if (!cursoActual.esPropio && !cursoActual.permisos?.editar) {
            mostrarNotificacion("No tienes permisos para editar este curso", "error");
            return false;
        }

        
        // Crear copia profunda para evitar mutaciones
        const cursoParaGuardar = JSON.parse(JSON.stringify({
            cursoId: curso.cursoId || cursoDocId,
            nombre: curso.nombre || "Curso sin nombre",
            descripcion: curso.descripcion || "",
            userId: currentUserId,
            creado: curso.creado || new Date(),
            temas: Array.isArray(curso.temas) ? curso.temas : [],
            actualizado: new Date()
        }));
        
        
        // Obtener datos existentes para mantener información de compartir
        const cursoRef = doc(db, "moodleCourses", cursoDocId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (cursoSnap.exists()) {
            const datosExistentes = cursoSnap.data();
            
            // Mantener datos de colaboración si existen
            if (datosExistentes.compartidoCon) {
                cursoParaGuardar.compartidoCon = datosExistentes.compartidoCon;
            }
            
            if (datosExistentes.compartidoConDetalles) {
                cursoParaGuardar.compartidoConDetalles = datosExistentes.compartidoConDetalles;
            }
            
            if (datosExistentes.propietarioNombre) {
                cursoParaGuardar.propietarioNombre = datosExistentes.propietarioNombre;
            }
        }
        
        // Usar setDoc para reemplazar todo el documento
        await setDoc(doc(db, "moodleCourses", cursoDocId), cursoParaGuardar, { merge: true });
        
        return true;
    } catch (error) {
        alert("Error al guardar el curso: " + error.message);
        return false;
    }
}




/* ELEMENTOS DEL DOM */
const listaTemas = document.getElementById("listaTemasSidebar");
const sidebarCursosEl = document.getElementById("sidebar2");
const sidebarTemasEl = document.getElementById("sidebarTemas");
const contenidoEditorEl = document.getElementById("contenidoEditor");
const editorResizeWrapEl = document.getElementById("editorResizeWrap");
const resizeSidebarCursosEl = document.getElementById("resizeSidebar2");
const resizeSidebarTemasEl = document.getElementById("resizeSidebarTemas");
const resizeContenidoEditorEl = document.getElementById("resizeContenidoEditor");

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function habilitarResizeHorizontal(handleEl, targetEl, options = {}) {
    if (!handleEl || !targetEl) return;

    const {
        min = 240,
        max = 720,
        storageKey = null,
        getMax = null
    } = options;

    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : null;
    if (!Number.isNaN(stored) && stored) {
        const maxNow = typeof getMax === "function" ? getMax() : max;
        targetEl.style.width = `${clamp(stored, min, maxNow)}px`;
    }

    const onPointerDown = (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = targetEl.getBoundingClientRect().width;
        handleEl.classList.add("is-dragging");

        const onMove = (moveEvent) => {
            const maxCurrent = typeof getMax === "function" ? getMax() : max;
            const next = clamp(startWidth + (moveEvent.clientX - startX), min, maxCurrent);
            targetEl.style.width = `${next}px`;
        };

        const onUp = () => {
            handleEl.classList.remove("is-dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (storageKey) {
                const w = Math.round(targetEl.getBoundingClientRect().width);
                localStorage.setItem(storageKey, String(w));
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    handleEl.addEventListener("pointerdown", onPointerDown);
}

function inicializarResizersPaneles() {
    habilitarResizeHorizontal(resizeSidebarCursosEl, sidebarCursosEl, {
        min: 220,
        max: 480,
        storageKey: "cb_sidebar2_width"
    });

    habilitarResizeHorizontal(resizeSidebarTemasEl, sidebarTemasEl, {
        min: 240,
        max: 560,
        storageKey: "cb_sidebarTemas_width"
    });

    habilitarResizeHorizontal(resizeContenidoEditorEl, contenidoEditorEl, {
        min: 420,
        max: 1600,
        storageKey: "cb_contenidoEditor_width",
        getMax: () => {
            if (!editorResizeWrapEl || !resizeContenidoEditorEl) return 1600;
            const total = editorResizeWrapEl.getBoundingClientRect().width;
            const handleWidth = resizeContenidoEditorEl.getBoundingClientRect().width || 6;
            return Math.max(420, Math.floor(total - handleWidth));
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarResizersPaneles);
} else {
    inicializarResizersPaneles();
}

const contenidoEditor = document.getElementById('contenidoEditor');
const textFormatMenu = document.getElementById('textFormatMenu');

let currentRange = null; // Para guardar la selección de texto

const btnAddTema = document.getElementById("btnAddTema");
btnAddTema.disabled = true; // sólo al inicio


/* AÑADIR TEMA */
/* AÑADIR TEMA - MODAL EN LUGAR DE PROMPT */
btnAddTema.addEventListener("click", async () => {
    if (!curso) {
        return alert("Primero selecciona un curso para añadir temas.");
    }

    // Crear modal dinámico si no existe
    if (!document.getElementById("modalAddTema")) {
        const modalHTML = `
            <div id="modalAddTema" class="modal fixed inset-0 bg-black/45 backdrop-blur-sm z-50 hidden items-center justify-center">
                <div class="bg-card text-foreground border border-border rounded-lg p-6 w-full max-w-md">
                    <h3 class="text-lg font-semibold mb-4 text-foreground">Nuevo Tema</h3>
                    <p class="text-sm text-muted-foreground mb-2">Curso: ${curso.nombre}</p>
                    <input 
                        type="text" 
                        id="inputNombreTema" 
                        placeholder="Nombre del nuevo tema"
                        class="w-full p-2 border border-input bg-background text-foreground rounded mb-4"
                    >
                    <div class="flex justify-end gap-2">
                        <button 
                            id="btnCancelarTema"
                            class="px-4 py-2 text-accent-foreground bg-accent hover:bg-accent/80 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            id="btnConfirmarTema"
                            class="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const modal = document.getElementById("modalAddTema");
    const input = document.getElementById("inputNombreTema");
    const btnCancelar = document.getElementById("btnCancelarTema");
    const btnConfirmar = document.getElementById("btnConfirmarTema");

    // Actualizar nombre del curso en el modal
    modal.querySelector("p").textContent = `Curso: ${curso.nombre}`;
    
    input.value = "";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    setTimeout(() => input.focus(), 100);

    // Esperar confirmación
    const nombre = await new Promise((resolve) => {
        const limpiarEventos = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };

        btnConfirmar.onclick = () => {
            const valor = input.value.trim();
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(valor);
        };

        btnCancelar.onclick = () => {
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(null);
        };

        // Enter para confirmar
        input.onkeypress = (e) => {
            if (e.key === 'Enter') btnConfirmar.click();
        };
        
        // Escape para cancelar
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') btnCancelar.click();
        };
    });

    if (!nombre) return;

    const tema = {
        id: crypto.randomUUID(),
        nombre: nombre.trim(),
        subtemas: []
    };

    curso.temas.push(tema);

    await guardarCursoFirebase();
    renderTemas();
});

function getModuloIcon(tipo) {
    const icons = {
        "Quizz": "fa-square-check",
        "Página": "fa-file-lines",
        "Archivo": "fa-file-arrow-down",
        "Libro": "fa-book",
        "Lección": "fa-person-chalkboard",
        "Tarea": "fa-pen-to-square",
        "URL": "fa-link",
        "Archivo adjunto": "fa-paperclip"
    };

    return icons[tipo] || "fa-file"; // default
}

function destruirSortablesSidebar() {
    if (sortableTemasInstance?.destroy) {
        sortableTemasInstance.destroy();
    }
    sortableTemasInstance = null;

    sortableSubtemasInstances.forEach((inst) => {
        if (inst?.destroy) inst.destroy();
    });
    sortableSubtemasInstances = [];
}

function inicializarSidebarSortable() {
    if (!USE_SORTABLE_SIDEBAR || !listaTemas || !curso?.temas) return;

    destruirSortablesSidebar();

    sortableTemasInstance = window.Sortable.create(listaTemas, {
        animation: 160,
        draggable: ".tema-dropzone",
        handle: ".accordion-trigger",
        ghostClass: "cb-sortable-ghost",
        chosenClass: "cb-sortable-chosen",
        dragClass: "cb-sortable-drag",
        filter: ".btn-export-tema, .btn-add-subtema, .btn-duplicate-tema, .btn-edit-tema, .btn-delete-tema, .subtema-draggable, .subtema-draggable *",
        preventOnFilter: false,
        onEnd: async (evt) => {
            if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
            const [temaMovido] = curso.temas.splice(evt.oldIndex, 1);
            if (!temaMovido) return;
            curso.temas.splice(evt.newIndex, 0, temaMovido);
            await guardarCursoFirebase();
            renderTemas();
        }
    });

    document.querySelectorAll(".subtemas-container").forEach((container) => {
        const instancia = window.Sortable.create(container, {
            group: "subtemas-sidebar",
            animation: 160,
            draggable: ".subtema-draggable",
            handle: ".accordion-trigger",
            ghostClass: "cb-sortable-ghost",
            chosenClass: "cb-sortable-chosen",
            dragClass: "cb-sortable-drag",
            filter: ".btn-duplicate-subtema, .btn-edit-subtema, .btn-delete-subtema, .module-draggable, .module-draggable *",
            preventOnFilter: false,
            onEnd: async (evt) => {
                const subtemaId = evt.item?.dataset?.id;
                const temaIdOrigen = evt.from?.dataset?.temaId;
                const temaIdDestino = evt.to?.dataset?.temaId;

                if (!subtemaId || !temaIdOrigen || !temaIdDestino || evt.newIndex == null) return;
                if (temaIdOrigen === temaIdDestino && evt.oldIndex === evt.newIndex) return;

                const cambioAplicado = moverSubtemaConPosicion(
                    temaIdOrigen,
                    temaIdDestino,
                    subtemaId,
                    evt.newIndex
                );
                if (!cambioAplicado) return;

                await guardarCursoFirebase();
                renderTemas();
            }
        });
        sortableSubtemasInstances.push(instancia);
    });
}


/* RENDER TEMAS + LOCALSTORAGE */
/* ==========================================================
      RENDER TEMAS + LOCALSTORAGE + DRAG SUBTEMAS
========================================================== */


function renderTemas() {
    try {
        listaTemas.innerHTML = "";

        const subtemaAbierto = localStorage.getItem("subtemaAbierto");
        const moduloActivo = localStorage.getItem("moduloActivo");

        // 🔥 Primero, verificar si el módulo activo aún existe en algún lugar
        let moduloActivoExiste = false;
        if (moduloActivo) {
            curso.temas.forEach(tema => {
                tema.subtemas.forEach(sub => {
                    if (sub.modulosIds && sub.modulosIds.includes(moduloActivo)) {
                        moduloActivoExiste = true;
                    }
                });
            });
            
            if (!moduloActivoExiste) {
                localStorage.removeItem("moduloActivo");
            }
        }

        curso.temas.forEach(tema => {
            /* ---------------------------
                TEMA (Accordion)
            --------------------------- */
            const temaWrapper = document.createElement("div");
            temaWrapper.className = "accordion tema-dropzone";
            temaWrapper.dataset.temaId = tema.id;

            const contieneSubtemaActivo = tema.subtemas.some(s => s.id === subtemaAbierto);

            temaWrapper.innerHTML = `
                <div class="accordion-trigger flex items-center gap-2 ${contieneSubtemaActivo ? 'bg-blue-50' : ''}">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-folder cb-node-icon"></i>
                        <span class="font-medium">${tema.nombre}</span>
                    </div>

                    <div class="flex items-center gap-3">
                        <i class="fas fa-file-word cursor-pointer cb-action-icon btn-export-tema" title="Descargar TODOS los subtemas en Word"></i>
                        <i class="fas fa-plus cursor-pointer cb-action-icon btn-add-subtema"></i>
                        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-tema"></i>
                        <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-tema"></i>
                        <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-tema"></i>
                        <i class="fas fa-chevron-right accordion-icon cb-node-icon"></i>
                    </div>
                </div>

                <div class="accordion-content">
                    <div class="accordion-body subtemas-container"></div>
                </div>
            `;

            temaWrapper.querySelector(".btn-export-tema").onclick = e => {
                e.stopPropagation();
                exportarTemaWord(tema);
            };

            const triggerTema = temaWrapper.querySelector('.accordion-trigger');
            const contentTema = temaWrapper.querySelector('.accordion-content');
            const bodyTema = temaWrapper.querySelector('.subtemas-container');
            bodyTema.dataset.temaId = tema.id;

            // RESTAURAR ESTADO
            let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");

            if (abiertosTemas.includes(tema.id)) {
                temaWrapper.classList.add("open");
                contentTema.style.height = "auto";
            } else {
                contentTema.style.height = "0px";
            }

            /* ---------------------------
                TOGGLE TEMA — MULTI-OPEN
            --------------------------- */
            triggerTema.addEventListener("click", e => {
                if (e.target.closest(".btn-add-subtema") ||
                    e.target.closest(".btn-edit-tema") ||
                    e.target.closest(".btn-delete-tema") ||
                    e.target.closest(".btn-duplicate-tema")) return;

                const isOpen = temaWrapper.classList.contains("open");

                if (!isOpen) {
                    temaWrapper.classList.add("open");
                    contentTema.style.height = "auto";

                    // Añadir a lista de temas abiertos
                    let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
                    if (!abiertosTemas.includes(tema.id)) abiertosTemas.push(tema.id);
                    localStorage.setItem("temasAbiertos", JSON.stringify(abiertosTemas));

                } else {
                    temaWrapper.classList.remove("open");
                    contentTema.style.height = "0px";

                    // Quitar de lista de temas abiertos
                    let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
                    abiertosTemas = abiertosTemas.filter(x => x !== tema.id);
                    localStorage.setItem("temasAbiertos", JSON.stringify(abiertosTemas));
                }
            });

            /* ---------------------------
                ACCIONES TEMA
            --------------------------- */
            temaWrapper.querySelector(".btn-edit-tema").onclick = async () => {
                const modalHTML = `
                    <div id="modalEditTema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                        <div class="bg-white rounded-lg p-6 w-full max-w-md">
                            <h3 class="text-lg font-semibold mb-4">Editar Tema</h3>
                            <input 
                                type="text" 
                                id="inputEditTema" 
                                placeholder="Nuevo nombre del tema"
                                class="w-full p-2 border border-gray-300 rounded mb-4"
                                value="${tema.nombre}"
                            >
                            <div class="flex justify-end gap-2">
                                <button 
                                    id="btnCancelarEditTema"
                                    class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    id="btnConfirmarEditTema"
                                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                const existingModal = document.getElementById("modalEditTema");
                if (existingModal) existingModal.remove();
                
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                
                const modal = document.getElementById("modalEditTema");
                const input = document.getElementById("inputEditTema");
                const btnCancelar = document.getElementById("btnCancelarEditTema");
                const btnConfirmar = document.getElementById("btnConfirmarEditTema");
                
                modal.classList.remove("hidden");
                modal.classList.add("flex");
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
                
                const nuevoNombre = await new Promise((resolve) => {
                    const limpiar = () => {
                        btnConfirmar.onclick = null;
                        btnCancelar.onclick = null;
                    };
                    
                    btnConfirmar.onclick = () => {
                        const valor = input.value.trim();
                        limpiar();
                        modal.classList.add("hidden");
                        resolve(valor);
                    };
                    
                    btnCancelar.onclick = () => {
                        limpiar();
                        modal.classList.add("hidden");
                        resolve(null);
                    };
                    
                    input.onkeypress = (e) => {
                        if (e.key === 'Enter') btnConfirmar.click();
                    };
                    
                    modal.onkeydown = (e) => {
                        if (e.key === 'Escape') btnCancelar.click();
                    };
                });
                
                setTimeout(() => modal.remove(), 300);
                
                if (!nuevoNombre) return;
                tema.nombre = nuevoNombre.trim();
                guardarCursoFirebase();
                renderTemas();
            };

            temaWrapper.querySelector(".btn-delete-tema").onclick = () => {
                if (!confirm("¿Eliminar tema completo?")) return;
                curso.temas = curso.temas.filter(t => t.id !== tema.id);
                guardarCursoFirebase();
                renderTemas();
            };

            temaWrapper.querySelector(".btn-duplicate-tema").onclick = () => {
                duplicarTema(tema);
            };

            temaWrapper.querySelector(".btn-add-subtema").onclick = () => addSubtema(tema);

            if (!USE_SORTABLE_SIDEBAR) {
                /* =====================================================
                        DRAG & DROP — SUBTEMAS (fallback nativo)
                ===================================================== */
                temaWrapper.addEventListener("dragover", e => {
                    e.preventDefault();
                    temaWrapper.classList.add("drop-target");
                });

                temaWrapper.addEventListener("dragleave", () => {
                    temaWrapper.classList.remove("drop-target");
                });

                temaWrapper.addEventListener("drop", async e => {
                    e.preventDefault();
                    temaWrapper.classList.remove("drop-target");

                    const subtemaId = e.dataTransfer.getData("subtemaId");
                    const temaIdOrigen = e.dataTransfer.getData("temaIdOrigen");
                    const temaIdDestino = tema.id;

                    if (!subtemaId || temaIdOrigen === temaIdDestino) return;

                    moverSubtema(temaIdOrigen, temaIdDestino, subtemaId);

                    await guardarCursoFirebase();
                    renderTemas();
                });
            }

            /* =====================================================
                        SUBTEMAS
            ===================================================== */
            tema.subtemas.forEach(sub => {
                const subAcc = document.createElement("div");
                subAcc.className = "accordion pl-4 subtema-draggable";
                subAcc.dataset.id = sub.id;

                const esSubtemaActivo = sub.id === subtemaAbierto;
                const contieneModuloActivo = (sub.modulosIds || []).includes(moduloActivo);

                subAcc.innerHTML = `
                    <div class="accordion-trigger flex items-center gap-2 ${esSubtemaActivo || contieneModuloActivo ? 'subtema-activo' : ''}">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-file cb-node-icon"></i>
                            <span class="${esSubtemaActivo ? 'font-semibold' : ''}">${sub.nombre}</span>
                        </div>

                        <div class="flex items-center gap-2">
                            <button class="icon-btn p-1 btn-add-modulo-subtema" title="Añadir módulo" aria-label="Añadir módulo">
                                <i class="fas fa-plus"></i>
                            </button>
                            <i class="fas fa-copy cursor-pointer cb-action-icon btn-duplicate-subtema"></i>
                            <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-subtema"></i>
                            <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-subtema"></i>
                            <i class="fas fa-chevron-right accordion-icon cb-node-icon"></i>
                        </div>
                    </div>

                    <div class="accordion-content">
                        <div class="accordion-body modulos-container"></div>
                    </div>
                `;

                const subTrigger = subAcc.querySelector(".accordion-trigger");
                const subContent = subAcc.querySelector(".accordion-content");
                const subBody = subAcc.querySelector(".modulos-container");


                    const modulosContainer = subAcc.querySelector(".modulos-container");
    
                    if (modulosContainer) {
                        modulosContainer.addEventListener("dragover", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            modulosContainer.classList.add("drop-target");
                        });

                        modulosContainer.addEventListener("dragleave", (e) => {
                            e.stopPropagation();
                            modulosContainer.classList.remove("drop-target");
                        });

                        modulosContainer.addEventListener("drop", async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            modulosContainer.classList.remove("drop-target");

                            const moduloId = e.dataTransfer.getData("moduloId");
                            const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                            const subtemaIdDestino = sub.id;
                            const isReorder = e.dataTransfer.getData("isReorder") === "true";

                            if (!moduloId) return;


                            // ================================================
                            // 1. REORDENAR MÓDULO EN EL MISMO SUBTEMA
                            // ================================================
                            if (isReorder && subtemaIdOrigen === subtemaIdDestino) {
                                const originalIndex = Number(e.dataTransfer.getData("originalIndex"));
                                
                                // El elemento exacto donde cayó el drop
                                const targetItem = e.target.closest(".module-draggable");
                                
                                // Si no hay destino válido, poner al final
                                const targetIndex = targetItem 
                                    ? [...modulosContainer.querySelectorAll(".module-draggable")].indexOf(targetItem)
                                    : modulosContainer.querySelectorAll(".module-draggable").length;
                                
                                // Validar rango
                                if (targetIndex >= 0 && originalIndex >= 0 && originalIndex !== targetIndex) {
                                    await reordenarModulo(subtemaIdDestino, originalIndex, targetIndex);
                                    return;
                                }
                            }

                            // ================================================
                            // 2. MOVER ENTRE SUBTEMAS DISTINTOS
                            // ================================================
                            if (subtemaIdOrigen !== subtemaIdDestino) {
                                await moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId);
                                return;
                            }
                        });
                    }


                /* =====================================================
                      DROPZONE — SOLO PARA MÓDULOS (MEJORADO)
                ===================================================== */
                subBody.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    subBody.classList.add("drop-target");
                });

                subBody.addEventListener("dragleave", (e) => {
                    e.stopPropagation();
                    subBody.classList.remove("drop-target");
                });

                subBody.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    subBody.classList.remove("drop-target");

                    const moduloId = e.dataTransfer.getData("moduloId");
                    const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                    const subtemaIdDestino = sub.id;
                    const isReorder = e.dataTransfer.getData("isReorder") === "true";

                    if (!moduloId) return;


                    // REORDENAR EN EL MISMO SUBTEMA
                    if (isReorder && subtemaIdOrigen === subtemaIdDestino) {
                        const originalIndex = parseInt(e.dataTransfer.getData("originalIndex"));
                        const targetItem = e.target.closest(".module-draggable");
                        
                        // Calcular nueva posición
                        let targetIndex = sub.modulosIds.length - 1; // Por defecto al final
                        if (targetItem) {
                            const targetModId = targetItem.dataset.moduloId;
                            targetIndex = sub.modulosIds.indexOf(targetModId);
                            if (targetIndex === -1) targetIndex = sub.modulosIds.length - 1;
                        }
                        
                        // Validar índices
                        if (originalIndex >= 0 && targetIndex >= 0 && originalIndex !== targetIndex) {
                            await reordenarModulo(subtemaIdDestino, originalIndex, targetIndex);
                        }
                        return;
                    }

                    // MOVER A OTRO SUBTEMA
                    if (subtemaIdOrigen !== subtemaIdDestino) {
                        await moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId);
                        return;
                    }
                });





                /* -----------------------------------
                    DRAG SUBTEMA
                ----------------------------------- */
                if (!USE_SORTABLE_SIDEBAR) {
                    subAcc.draggable = true;

                    subAcc.addEventListener("dragstart", e => {
                        e.dataTransfer.setData("subtemaId", sub.id);
                        e.dataTransfer.setData("temaIdOrigen", tema.id);
                        subAcc.classList.add("dragging-subtema");
                    });

                    subAcc.addEventListener("dragend", () => {
                        subAcc.classList.remove("dragging-subtema");
                    });
                }

                /* -----------------------------------
                    RESTAURAR ESTADO
                ----------------------------------- */
                let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                if (abiertos.includes(sub.id)) {
                    subAcc.classList.add("open");
                    subContent.style.height = "auto";
                } else {
                    subContent.style.height = "0px";
                }

                /* TOGGLE SUBTEMA */
                subTrigger.addEventListener("click", e => {
                if (e.target.closest(".btn-add-modulo-subtema")) return;
                if (e.target.closest(".btn-duplicate-subtema") ||
                    e.target.closest(".btn-edit-subtema") ||
                    e.target.closest(".btn-delete-subtema")) return;

                const isOpen = subAcc.classList.contains("open");

                if (!isOpen) {
                    subAcc.classList.add("open");
                    subContent.style.height = subBody.scrollHeight + "px";

                    // ➕ AGREGAR a lista de subtemas abiertos
                    let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                    if (!abiertos.includes(sub.id)) abiertos.push(sub.id);
                    localStorage.setItem("subtemasAbiertos", JSON.stringify(abiertos));

                } else {
                    subAcc.classList.remove("open");
                    subContent.style.height = "0px";

                    // ➖ QUITAR de lista de subtemas abiertos
                    let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                    abiertos = abiertos.filter(x => x !== sub.id);
                    localStorage.setItem("subtemasAbiertos", JSON.stringify(abiertos));
                }

                subtemaActivo = sub;
                temaActivo = tema;
                
                // 🔥 CORRECCIÓN: Verificar permisos antes de cargar
                const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
                const puedeEditar = cursoActual?.esPropio || cursoActual?.permisos?.editar === true;
                
                // Cargar subtema siempre, pero en modo lectura si no tiene permisos
                cargarSubtema(sub, null, !puedeEditar);
                });

                const btnAddModuloSubtema = subAcc.querySelector(".btn-add-modulo-subtema");
                if (btnAddModuloSubtema) {
                    btnAddModuloSubtema.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        mostrarSelectorModulo(sub);
                    };
                }


                /* ---------
                    CRUD SUBTEMA
                --------- */
                subAcc.querySelector(".btn-edit-subtema").onclick = async e => {
                    e.stopPropagation();
                    
                    const modalHTML = `
                        <div id="modalEditSubtema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                            <div class="bg-white rounded-lg p-6 w-full max-w-md">
                                <h3 class="text-lg font-semibold mb-4">Editar Subtema</h3>
                                <input 
                                    type="text" 
                                    id="inputEditSubtema" 
                                    placeholder="Nuevo nombre del subtema"
                                    class="w-full p-2 border border-gray-300 rounded mb-4"
                                    value="${sub.nombre}"
                                >
                                <div class="flex justify-end gap-2">
                                    <button 
                                        id="btnCancelarEditSubtema"
                                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        id="btnConfirmarEditSubtema"
                                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    const existingModal = document.getElementById("modalEditSubtema");
                    if (existingModal) existingModal.remove();
                    
                    document.body.insertAdjacentHTML('beforeend', modalHTML);
                    
                    const modal = document.getElementById("modalEditSubtema");
                    const input = document.getElementById("inputEditSubtema");
                    const btnCancelar = document.getElementById("btnCancelarEditSubtema");
                    const btnConfirmar = document.getElementById("btnConfirmarEditSubtema");
                    
                    modal.classList.remove("hidden");
                    modal.classList.add("flex");
                    setTimeout(() => {
                        input.focus();
                        input.select();
                    }, 100);
                    
                    const nuevoNombre = await new Promise((resolve) => {
                        const limpiar = () => {
                            btnConfirmar.onclick = null;
                            btnCancelar.onclick = null;
                        };
                        
                        btnConfirmar.onclick = () => {
                            const valor = input.value.trim();
                            limpiar();
                            modal.classList.add("hidden");
                            resolve(valor);
                        };
                        
                        btnCancelar.onclick = () => {
                            limpiar();
                            modal.classList.add("hidden");
                            resolve(null);
                        };
                        
                        input.onkeypress = (e) => {
                            if (e.key === 'Enter') btnConfirmar.click();
                        };
                        
                        modal.onkeydown = (e) => {
                            if (e.key === 'Escape') btnCancelar.click();
                        };
                    });
                    
                    setTimeout(() => modal.remove(), 300);
                    
                    if (!nuevoNombre) return;
                    sub.nombre = nuevoNombre.trim();
                    guardarCursoFirebase();
                    renderTemas();
                };

                subAcc.querySelector(".btn-delete-subtema").onclick = e => {
                    e.stopPropagation();
                    if (!confirm("¿Eliminar subtema?")) return;
                    tema.subtemas = tema.subtemas.filter(s => s.id !== sub.id);
                    guardarCursoFirebase();
                    renderTemas();
                };

                subAcc.querySelector(".btn-duplicate-subtema").onclick = e => {
                    e.stopPropagation();
                    duplicarSubtema(tema, sub);
                };

                /* =====================================================
                        MÓDULOS (MEJORADO)
                ===================================================== */
/* =====================================================
                        MÓDULOS (MEJORADO)
==================================================== */
        if (!sub.modulosIds || sub.modulosIds.length === 0) {
            subBody.innerHTML = `<p class="text-gray-400 text-xs">— No hay módulos —</p>`;
            } else {
                // Crear contenedor con clase especial para drag and drop
                subBody.classList.add('modulos-container-dnd');
                
                // Usar Promise.all para cargar módulos en paralelo
                const promesasModulos = sub.modulosIds.map(async (modId, index) => {
                    try {
                        // IMPORTANTE: Construir el ID compuesto para buscar el módulo
                        let idParaBuscar = modId;
                        
                        // Si el ID NO contiene guión bajo, significa que es solo el ID interno
                        // y necesitamos construir el ID compuesto: curso.id_modId
                        if (!modId.includes('_')) {
                            idParaBuscar = `${curso.id}_${modId}`;
                        }
                        
                        const mod = await obtenerModulo(idParaBuscar);
                        if (!mod) {
                            // Intentar con el ID original también, por compatibilidad
                            const modAlt = await obtenerModulo(modId);
                            if (!modAlt) {
                                return null;
                            }
                            if (modAlt.archivado && !mostrarModulosArchivados) return null;
                            return modAlt;
                        }

                        if (mod.archivado && !mostrarModulosArchivados) return null;

                        const esModuloActivo = moduloActivoExiste && modId === moduloActivo;

                        const li = document.createElement("div");
                        li.className = `pl-8 py-1 text-xs hover:bg-gray-50 flex items-center justify-between cursor-pointer draggable-modulo module-draggable ${
                            esModuloActivo ? 'modulo-activo highlight-pulse' : ''
                        }`;
                        li.dataset.moduloId = modId;
                        li.dataset.index = index; // Añadir índice para referencia
                        li.draggable = true;

                        li.innerHTML = `
                            <div class="flex items-center gap-2 flex-1 modulo-select">
                                <i class="fas fa-grip-vertical cb-node-icon cb-module-grip mr-1 cursor-grab handle-drag" title="Arrastrar para reordenar"></i>
                                <i class="fas ${getModuloIcon(mod?.tipo)} cb-node-icon cb-module-kind-icon ${esModuloActivo ? 'is-active' : ''}"></i>
                                <span class="modulo-nombre ${esModuloActivo ? 'font-semibold' : ''}">
                                    ${mod?.nombre || "Módulo"}
                                </span>
                                ${mod?.archivado ? '<span class="text-[10px] text-amber-600 ml-2">(archivado)</span>' : ''}
                                <span class="text-gray-400 text-[10px] ml-2"></span>
                            </div>

                            <div class="flex items-center gap-2 text-[11px] modulo-actions">
                                <i class="fas fa-copy cursor-pointer cb-action-icon btn-duplicate-modulo"></i>
                                <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-modulo"></i>
                                <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-modulo"></i>
                            </div>
                        `;

                        /* =====================================================
                            DRAG & DROP PARA REORDENAR (DENTRO DEL MISMO SUBTEMA)
                        ===================================================== */
                        li.addEventListener("dragstart", e => {
                            // Usar el ID normalizado
                            const idNormalizado = normalizarIdModulo(modId, false);
                            
                            e.dataTransfer.setData("moduloId", idNormalizado);
                            e.dataTransfer.setData("subtemaIdOrigen", sub.id);
                            e.dataTransfer.setData("isReorder", "true");
                            e.dataTransfer.setData("originalIndex", index.toString());
                            e.dataTransfer.effectAllowed = "move";
                            
                            li.classList.add("modulo-arrastrando");
                        });


                        li.addEventListener("dragover", e => {
                            e.preventDefault();
                            // Solo mostrar efecto si es del mismo subtema
                            if (e.dataTransfer.getData("subtemaIdOrigen") === sub.id) {
                                li.classList.add("drag-over");
                            }
                        });

                        li.addEventListener("dragleave", () => {
                            li.classList.remove("drag-over");
                        });

                        li.addEventListener("dragend", () => {
                            li.classList.remove("modulo-arrastrando", "drag-over");
                            // Limpiar todas las clases drag-over
                            subBody.querySelectorAll('.drag-over').forEach(el => {
                                el.classList.remove('drag-over');
                            });
                        });

                        li.addEventListener("drop", async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const moduloId = e.dataTransfer.getData("moduloId");
                            const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                            const isReorder = e.dataTransfer.getData("isReorder") === "true";
                            
                            // Si es reordenamiento dentro del mismo subtema
                            if (isReorder && subtemaIdOrigen === sub.id) {
                                const originalIndex = parseInt(e.dataTransfer.getData("originalIndex"));
                                const targetIndex = parseInt(li.dataset.index);
                                
                                if (originalIndex !== targetIndex) {
                                    await reordenarModulo(sub.id, originalIndex, targetIndex);
                                }
                            }
                            
                            li.classList.remove("drag-over");
                        });

                        // SELECT MODULO (resto del código igual...)
                        li.querySelector(".modulo-select").onclick = e => {
                            e.stopPropagation();

                            // limpiar anteriores
                            document.querySelectorAll("[data-modulo-id]").forEach(m => {
                                m.classList.remove("modulo-activo", "highlight-pulse");
                            });

                            // marcar visualmente
                            li.classList.add("modulo-activo", "highlight-pulse");

                            // GUARDAR EL ID REAL DEL MÓDULO
                            localStorage.setItem("moduloActivo", modId);

                            // actualizar globales
                            subtemaActivo = sub;
                            temaActivo = tema;

                            // cargar en editor
                            cargarSubtema(sub, modId);
                        };

                        /* DUPLICAR MODULO */
                        li.querySelector(".btn-duplicate-modulo").onclick = async e => {
                            e.stopPropagation();

                            // Construir ID compuesto para buscar
                            let idParaBuscarOriginal = modId;
                            if (!modId.includes('_')) {
                                idParaBuscarOriginal = `${curso.id}_${modId}`;
                            }
                            
                            const original = await obtenerModulo(idParaBuscarOriginal);
                            if (!original) {
                                alert("Error: módulo original no encontrado.");
                                return;
                            }

                            const nuevoId = crypto.randomUUID();

                            const nuevoModulo = JSON.parse(JSON.stringify(original));
                            nuevoModulo.id = nuevoId;
                            nuevoModulo.nombre = original.nombre + " (copia)";
                            nuevoModulo.creado = Date.now();
                            nuevoModulo.actualizado = Date.now();

                            // IMPORTANTE: Guardar con ID compuesto
                            await setDoc(
                                doc(db, "moodleCourses", `${curso.id}_${nuevoId}`),
                                nuevoModulo
                            );

                            if (!sub.modulosIds) sub.modulosIds = [];
                            // Guardar solo el ID interno en el array
                            sub.modulosIds.push(nuevoId);

                            await guardarCursoFirebase();
                            renderTemas();

                            setTimeout(() => {
                                cargarSubtema(sub, nuevoId);
                            }, 200);
                        };


                        /* EDITAR MODULO */
                        li.querySelector(".btn-edit-modulo").onclick = async e => {
                            e.stopPropagation();

                            const modalHTML = `
                                <div id="modalEditModulo" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                                    <div class="bg-white rounded-lg p-6 w-full max-w-md">
                                        <h3 class="text-lg font-semibold mb-4">Editar Módulo</h3>
                                        <input 
                                            type="text" 
                                            id="inputEditModulo" 
                                            placeholder="Nuevo nombre del módulo"
                                            class="w-full p-2 border border-gray-300 rounded mb-4"
                                            value="${mod.nombre}"
                                        >
                                        <div class="flex justify-end gap-2">
                                            <button 
                                                id="btnCancelarEditModulo"
                                                class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                            >
                                                Cancelar
                                            </button>
                                            <button 
                                                id="btnConfirmarEditModulo"
                                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;

                            const existingModal = document.getElementById("modalEditModulo");
                            if (existingModal) existingModal.remove();
                            document.body.insertAdjacentHTML('beforeend', modalHTML);

                            const modal = document.getElementById("modalEditModulo");
                            const input = document.getElementById("inputEditModulo");
                            const btnCancelar = document.getElementById("btnCancelarEditModulo");
                            const btnConfirmar = document.getElementById("btnConfirmarEditModulo");

                            modal.classList.remove("hidden");
                            modal.classList.add("flex");
                            setTimeout(() => {
                                input.focus();
                                input.select();
                            }, 100);

                            const nuevoNombre = await new Promise(resolve => {
                                const limpiar = () => {
                                    btnConfirmar.onclick = null;
                                    btnCancelar.onclick = null;
                                };

                                btnConfirmar.onclick = () => {
                                    const valor = input.value.trim();
                                    limpiar();
                                    modal.classList.add("hidden");
                                    resolve(valor);
                                };

                                btnCancelar.onclick = () => {
                                    limpiar();
                                    modal.classList.add("hidden");
                                    resolve(null);
                                };
                            });

                            setTimeout(() => modal.remove(), 300);

                            if (!nuevoNombre) return;

                            await guardarModulo(mod.id, { nombre: nuevoNombre.trim() });
                            renderTemas();
                        };

                        /* ELIMINAR MODULO */
                        li.querySelector(".btn-delete-modulo").onclick = e => {
                            e.stopPropagation();
                            if (!confirm("¿Eliminar módulo?")) return;
                            sub.modulosIds = sub.modulosIds.filter(id => id !== modId);
                            
                            // Si eliminamos el módulo activo, limpiar estado
                            if (modId === moduloActivo) {
                                localStorage.removeItem("moduloActivo");
                            }
                            
                            guardarCursoFirebase();
                            renderTemas();
                        };

                        return li;
                    } catch (error) {
                        return null;
                    }
                });

                // Esperar a que todos los módulos se carguen
                Promise.all(promesasModulos).then(elementos => {
                    let agregados = 0;
                    elementos.forEach(li => {
                        if (li) subBody.appendChild(li);
                        if (li) agregados += 1;
                    });
                    if (agregados === 0) {
                        subBody.innerHTML = `<p class="text-gray-400 text-xs">— No hay módulos —</p>`;
                    }
                    
                    // 🔥 Ajustar altura del accordion después de cargar módulos
                    if (subAcc.classList.contains("open")) {
                        setTimeout(() => {
                            subContent.style.height = subBody.scrollHeight + "px";
                        }, 50);
                    }
                });
            }

                bodyTema.appendChild(subAcc);
            });

            listaTemas.appendChild(temaWrapper);
        });

        if (USE_SORTABLE_SIDEBAR) {
            inicializarSidebarSortable();
        }
    } catch (error) {
        alert("Error al renderizar los temas. Por favor, recarga la página.");
    }
}

document.querySelectorAll(".tema-dropzone").forEach(temaEl => {
    temaEl.draggable = true;

    temaEl.addEventListener("dragstart", e => {
        e.dataTransfer.setData("temaId", temaEl.dataset.temaId);
        temaEl.classList.add("tema-arrastrando");
    });

    temaEl.addEventListener("dragend", () => {
        temaEl.classList.remove("tema-arrastrando");
    });

    temaEl.addEventListener("drop", e => {
        const temaIdOrigen = e.dataTransfer.getData("temaId");
        const temaIdDestino = temaEl.dataset.temaId;

        if (!temaIdOrigen || temaIdOrigen === temaIdDestino) return;

        moverTema(temaIdOrigen, temaIdDestino);
        guardarCursoFirebase();
        renderTemas();
    });
});


/* ================================================
   DROPZONE GLOBAL PARA TEMAS
================================================ */
document.querySelectorAll(".tema-dropzone").forEach(drop => {
    drop.addEventListener("dragover", e => {
        e.preventDefault();
        drop.classList.add("drop-target");
    });

    drop.addEventListener("dragleave", () => {
        drop.classList.remove("drop-target");
    });

    drop.addEventListener("drop", async e => {
        e.preventDefault();
        drop.classList.remove("drop-target");

        const temaDestino = drop.dataset.temaId;

        const moduloId = e.dataTransfer.getData("moduloId");
        const subtemaId = e.dataTransfer.getData("subtemaId");
        const temaOrigen = e.dataTransfer.getData("temaIdOrigen");

        // ============================
        // 1. MOVER SUBTEMA ENTRE TEMAS
        // ============================
        if (subtemaId) {
            moverSubtema(temaOrigen, temaDestino, subtemaId);
            await guardarCursoFirebase();
            renderTemas();
            return;
        }

        // ============================
        // 2. MOVER MÓDULO A ÚLTIMO SUBTEMA DEL TEMA
        // ============================
        if (moduloId) {
            const tema = curso.temas.find(t => t.id === temaDestino);

            if (tema.subtemas.length === 0) return alert("Este tema no tiene subtemas");

            const ultimoSubtema = tema.subtemas[tema.subtemas.length - 1];

            await moverModulo(
                e.dataTransfer.getData("subtemaIdOrigen"),
                ultimoSubtema.id,
                moduloId
            );

            return;
        }
    });
});


/* ==========================================================
   FUNCIONES PARA REORDENAR MÓDULOS
========================================================== */

// Función principal para reordenar módulos dentro de un subtema
async function reordenarModulo(subtemaId, indiceOrigen, indiceDestino) {
    try {
        
        // Encontrar el subtema
        let subtemaEncontrado = null;
        
        for (const t of curso.temas) {
            for (const s of t.subtemas) {
                if (s.id === subtemaId) {
                    subtemaEncontrado = s;
                    break;
                }
            }
            if (subtemaEncontrado) break;
        }
        
        if (!subtemaEncontrado) {
            return;
        }
        
        // Asegurar array
        if (!Array.isArray(subtemaEncontrado.modulosIds)) {
            subtemaEncontrado.modulosIds = [];
        }
        
        // Validar índices
        if (indiceOrigen < 0 || indiceOrigen >= subtemaEncontrado.modulosIds.length) {
            return;
        }
        
        if (indiceDestino < 0) indiceDestino = 0;
        if (indiceDestino > subtemaEncontrado.modulosIds.length) {
            indiceDestino = subtemaEncontrado.modulosIds.length;
        }
        
        // Reordenar
        const moduloMovido = subtemaEncontrado.modulosIds.splice(indiceOrigen, 1)[0];
        subtemaEncontrado.modulosIds.splice(indiceDestino, 0, moduloMovido);
        
        
        // Guardar
        await guardarCursoFirebase();
        
        // Actualizar UI
        renderTemas();
        
    } catch (error) {
        alert("Error al reordenar el módulo.");
    }
}


// Función para mover un módulo a una posición específica
async function moverModuloAPosicion(subtemaIdOrigen, subtemaIdDestino, moduloId, posicionDestino) {
    try {
        
        let subOrigen = null;
        let subDestino = null;
        
        // Buscar subtemas origen y destino
        curso.temas.forEach(t => {
            t.subtemas.forEach(s => {
                if (s.id === subtemaIdOrigen) subOrigen = s;
                if (s.id === subtemaIdDestino) subDestino = s;
            });
        });
        
        if (!subOrigen || !subDestino) {
            return;
        }
        
        // Asegurar arrays
        if (!Array.isArray(subOrigen.modulosIds)) subOrigen.modulosIds = [];
        if (!Array.isArray(subDestino.modulosIds)) subDestino.modulosIds = [];
        
        // Remover del origen
        const indexOrigen = subOrigen.modulosIds.indexOf(moduloId);
        if (indexOrigen === -1) {
            return;
        }
        
        subOrigen.modulosIds.splice(indexOrigen, 1);
        
        // Insertar en destino en la posición especificada
        const posicionFinal = Math.min(posicionDestino, subDestino.modulosIds.length);
        subDestino.modulosIds.splice(posicionFinal, 0, moduloId);
        
        // Actualizar referencia en Firestore
        await guardarModulo(moduloId, {
            subtemaId: subtemaIdDestino,
            cursoId: curso.id,
            actualizado: Date.now()
        });
        
        // Guardar curso
        await guardarCursoFirebase();
        
        // Actualizar UI
        renderTemas();
        
        // Si el módulo movido era el activo, actualizar
        const moduloActivoId = localStorage.getItem("moduloActivo");
        if (moduloActivoId === moduloId) {
            setTimeout(() => {
                cargarSubtema(subDestino, moduloId);
            }, 300);
        }
        
        
    } catch (error) {
        alert("Error al mover el módulo.");
    }
}


function moverTema(origen, destino) {
    const i1 = curso.temas.findIndex(t => t.id === origen);
    const i2 = curso.temas.findIndex(t => t.id === destino);

    if (i1 === -1 || i2 === -1) return;

    const temp = curso.temas[i1];
    curso.temas.splice(i1, 1);
    curso.temas.splice(i2, 0, temp);
}


/* ==========================================================
        MOVER SUBTEMA ENTRE TEMAS
========================================================== */
function moverSubtema(temaIdOrigen, temaIdDestino, subtemaId) {
    let temaOrigen = curso.temas.find(t => t.id === temaIdOrigen);
    let temaDestino = curso.temas.find(t => t.id === temaIdDestino);

    if (!temaOrigen || !temaDestino) return;

    const sub = temaOrigen.subtemas.find(s => s.id === subtemaId);

    if (!sub) return;

    // quitar de origen
    temaOrigen.subtemas = temaOrigen.subtemas.filter(s => s.id !== subtemaId);

    // agregar a destino
    temaDestino.subtemas.push(sub);
}

function moverSubtemaConPosicion(temaIdOrigen, temaIdDestino, subtemaId, indiceDestino) {
    const temaOrigen = curso.temas.find(t => t.id === temaIdOrigen);
    const temaDestino = curso.temas.find(t => t.id === temaIdDestino);
    if (!temaOrigen || !temaDestino) return false;

    const indiceOrigen = temaOrigen.subtemas.findIndex(s => s.id === subtemaId);
    if (indiceOrigen === -1) return false;

    const [subtema] = temaOrigen.subtemas.splice(indiceOrigen, 1);
    if (!subtema) return false;

    const destinoNormalizado = Math.max(0, Math.min(indiceDestino, temaDestino.subtemas.length));
    temaDestino.subtemas.splice(destinoNormalizado, 0, subtema);
    return true;
}


async function moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId) {
    try {
        
        // 1. BUSCAR SUBTEMAS ORIGEN Y DESTINO
        let subOrigen = null, subDestino = null;
        let temaOrigen = null, temaDestino = null;
        
        for (const t of curso.temas) {
            for (const s of t.subtemas) {
                if (s.id === subtemaIdOrigen) {
                    subOrigen = s;
                    temaOrigen = t;
                }
                if (s.id === subtemaIdDestino) {
                    subDestino = s;
                    temaDestino = t;
                }
            }
        }
        
        if (!subOrigen || !subDestino) {
            alert("Error: No se encontraron los subtemas.");
            return;
        }
        
        // 2. BUSCAR EL MÓDULO EN EL ARRAY (manejar ambos formatos de ID)
        let moduloIndex = -1;
        let idEnArray = null;
        
        // Asegurar que exista el array de módulos
        if (!subOrigen.modulosIds) subOrigen.modulosIds = [];
        
        // Buscar el módulo en el array
        for (let i = 0; i < subOrigen.modulosIds.length; i++) {
            const idActual = subOrigen.modulosIds[i];
            
            // Comparación directa
            if (idActual === moduloId) {
                moduloIndex = i;
                idEnArray = idActual;
                break;
            }
            
            // Si moduloId es interno (sin guión) pero en array está compuesto
            if (!moduloId.includes('_') && idActual.includes('_')) {
                const partes = idActual.split('_');
                if (partes.length > 1 && partes[1] === moduloId) {
                    moduloIndex = i;
                    idEnArray = idActual;
                    break;
                }
            }
            
            // Si moduloId es compuesto pero en array está interno
            if (moduloId.includes('_') && !idActual.includes('_')) {
                const partesModulo = moduloId.split('_');
                if (partesModulo.length > 1 && partesModulo[1] === idActual) {
                    moduloIndex = i;
                    idEnArray = idActual;
                    break;
                }
            }
        }
        
        if (moduloIndex === -1) {
            return;
        }
        
        // 3. REMOVER DEL ORIGEN
        const moduloMovido = subOrigen.modulosIds.splice(moduloIndex, 1)[0];
        
        // 4. AGREGAR AL DESTINO
        if (!subDestino.modulosIds) subDestino.modulosIds = [];
        subDestino.modulosIds.push(moduloMovido);
        
        // 5. ACTUALIZAR EL DOCUMENTO EN FIRESTORE
        try {
            // Obtener datos del módulo
            const moduloData = await obtenerModulo(moduloMovido, curso.id);
            
            if (moduloData) {
                // Determinar el ID correcto para Firestore
                let idFirestore = moduloMovido;
                if (!moduloMovido.includes('_')) {
                    idFirestore = `${curso.id}_${moduloMovido}`;
                }
                
                // Actualizar el documento del módulo
                await updateDoc(doc(db, "moodleCourses", idFirestore), {
                    subtemaId: subtemaIdDestino,
                    cursoId: curso.id,
                    actualizado: Date.now()
                });
            }
        } catch (firestoreError) {
            // Continuar aunque falle la actualización individual, el curso se guardará completo
        }
        
        // 6. GUARDAR CAMBIOS DEL CURSO
        await guardarCursoFirebase();
        
        // 7. ACTUALIZAR UI COMPLETA
        renderTemas();
        
        // 8. CARGAR EL SUBTEMA DESTINO (opcional)
        if (subtemaActivo && subtemaActivo.id === subtemaIdDestino) {
            setTimeout(() => {
                cargarSubtema(subDestino);
            }, 300);
        }
        
        
    } catch (error) {
        alert("Error al mover el módulo: " + error.message);
    }
}




// ✅ NUEVA FUNCIÓN: Actualizar UI optimizada después de mover módulo
async function actualizarUIAfterMoverModulo(moduloId, subtemaIdOrigen, subtemaIdDestino) {
    
    // Guardar estados
    const temasAbiertos = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
    const subtemasAbiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
    const moduloActivo = localStorage.getItem("moduloActivo");
    
    // Si es movimiento entre diferentes subtemas, hacer render completo
    if (subtemaIdOrigen !== subtemaIdDestino) {
        renderTemas();
        // Restaurar selección si este módulo era el activo
        if (moduloActivo && (moduloActivo === moduloId || 
            (moduloId.includes('_') && moduloId.split('_')[1] === moduloActivo) ||
            (!moduloId.includes('_') && `${curso.id}_${moduloId}` === moduloActivo))) {
            setTimeout(() => {
                document.querySelectorAll(`[data-modulo-id]`).forEach(el => {
                    const elId = el.dataset.moduloId;
                    if (elId === moduloId || 
                        (elId.includes('_') && elId.split('_')[1] === moduloId) ||
                        (!elId.includes('_') && moduloId.includes('_') && elId === moduloId.split('_')[1])) {
                        el.classList.add('modulo-activo', 'highlight-pulse');
                    }
                });
            }, 300);
        }
        return;
    }
    
    // Si es reordenamiento en el mismo subtema
    try {
        // Encontrar el subtema en el DOM
        const subtemaElement = document.querySelector(`[data-id="${subtemaIdOrigen}"]`);
        if (!subtemaElement) {
            renderTemas();
            return;
        }
        
        // Obtener contenedor de módulos
        const modulosContainer = subtemaElement.querySelector('.modulos-container');
        if (!modulosContainer) {
            renderTemas();
            return;
        }
        
        // Obtener todos los elementos de módulo
        const moduloElements = Array.from(modulosContainer.querySelectorAll('[data-modulo-id]'));
        
        // Crear nuevo array en el orden correcto
        const nuevoOrden = [];
        moduloElements.forEach(el => {
            nuevoOrden.push(el.dataset.moduloId);
        });
        
        // Actualizar el array en el curso
        const subtema = curso.temas.flatMap(t => t.subtemas).find(s => s.id === subtemaIdOrigen);
        if (subtema) {
            subtema.modulosIds = nuevoOrden;
            
            // Hacer un render suave manteniendo el estado abierto
            const subtemaAbierto = subtemaElement.classList.contains('open');
            const contenidoHeight = subtemaElement.querySelector('.accordion-content').scrollHeight;
            
            // Reconstruir solo los módulos de este subtema
            const nuevosModulosHTML = await generarHTMLModulos(subtema);
            modulosContainer.innerHTML = nuevosModulosHTML;
            
            // Restaurar estado abierto
            if (subtemaAbierto) {
                subtemaElement.classList.add('open');
                subtemaElement.querySelector('.accordion-content').style.height = `${contenidoHeight}px`;
            }
            
            // Restaurar selección
            if (moduloActivo) {
                moduloElements.forEach(el => {
                    if (el.dataset.moduloId === moduloActivo ||
                        (el.dataset.moduloId.includes('_') && el.dataset.moduloId.split('_')[1] === moduloActivo)) {
                        el.classList.add('modulo-activo', 'highlight-pulse');
                    }
                });
            }
        }
        
    } catch (error) {
        renderTemas();
    }
    
    // Restaurar estados de acordeones
    setTimeout(() => {
        restaurarEstadosAcordeones(temasAbiertos, subtemasAbiertos);
    }, 50);
}


// Función auxiliar para actualizar contadores de módulos
function actualizarContadoresSubtema(subtemaId) {
    const subtemaElement = document.querySelector(`[data-id="${subtemaId}"]`);
    if (!subtemaElement) return;
    
    const contadorElement = subtemaElement.querySelector('.contador-modulos');
    if (contadorElement) {
        // Encontrar el subtema en la estructura del curso
        let subtema = null;
        curso.temas.forEach(t => {
            t.subtemas.forEach(s => {
                if (s.id === subtemaId) {
                    subtema = s;
                }
            });
        });
        
        if (subtema) {
            const count = subtema.modulosIds ? subtema.modulosIds.length : 0;
            contadorElement.textContent = `(${count})`;
        }
    }
}

// Función auxiliar para restaurar estados de acordeones
function restaurarEstadosAcordeones(temasAbiertos, subtemasAbiertos) {
    temasAbiertos.forEach(temaId => {
        const temaElement = document.querySelector(`[data-tema-id="${temaId}"]`);
        if (temaElement) {
            temaElement.classList.add('open');
            const content = temaElement.querySelector('.accordion-content');
            if (content) {
                content.style.height = 'auto';
            }
        }
    });
    
    subtemasAbiertos.forEach(subtemaId => {
        const subtemaElement = document.querySelector(`[data-id="${subtemaId}"]`);
        if (subtemaElement) {
            subtemaElement.classList.add('open');
            const content = subtemaElement.querySelector('.accordion-content');
            if (content) {
                content.style.height = 'auto';
            }
        }
    });
}




/* AÑADIR SUBTEMA */
async function addSubtema(tema) {
    // Crear el modal si no existe
    if (!document.getElementById("modalAddSubtema")) {
        crearModalSubtema();
    }

    const modal = document.getElementById("modalAddSubtema");
    const input = document.getElementById("inputNombreSubtema");
    const btnCancelar = document.getElementById("btnCancelarSubtema");
    const btnConfirmar = document.getElementById("btnConfirmarSubtema");

    // Resetear el input
    input.value = "";
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar el input
    setTimeout(() => input.focus(), 100);

    // Esperar a que el usuario confirme o cancele
    return new Promise((resolve) => {
        const limpiarEventos = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };

        const confirmar = async () => {
            const nombre = input.value.trim();
            if (!nombre) {
                input.classList.add("border-red-500");
                setTimeout(() => input.classList.remove("border-red-500"), 1000);
                return;
            }

            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");

            // Crear el subtema
            tema.subtemas.push({
                id: crypto.randomUUID(),
                nombre,
                instrucciones: "",
                contenidoGenerado: "",
                modulos: [],
                traducciones: [] 
            });

            await guardarCursoFirebase();
            localStorage.setItem("subtemaAbierto", tema.subtemas[tema.subtemas.length - 1].id);
            renderTemas();
            resolve(true);
        };

        const cancelar = () => {
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(false);
        };

        btnConfirmar.onclick = confirmar;
        btnCancelar.onclick = cancelar;

        // También permitir Enter para confirmar
        input.onkeypress = (e) => {
            if (e.key === 'Enter') confirmar();
        };
        
        // Permitir Escape para cancelar
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') cancelar();
        };
    });
}

/* Función para crear el modal dinámicamente si no existe */
function crearModalSubtema() {
    const modalHTML = `
        <div id="modalAddSubtema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
            <div class="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 class="text-lg font-semibold mb-4">Nuevo Subtema</h3>
                <input 
                    type="text" 
                    id="inputNombreSubtema" 
                    placeholder="Nombre del subtema"
                    class="w-full p-2 border border-gray-300 rounded mb-4"
                >
                <div class="flex justify-end gap-2">
                    <button 
                        id="btnCancelarSubtema"
                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancelar
                    </button>
                    <button 
                        id="btnConfirmarSubtema"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Crear
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}


async function duplicarTema(temaOriginal) {

    // 1. Copia profunda
    const nuevoTema = JSON.parse(JSON.stringify(temaOriginal));

    // 2. Nuevo ID
    nuevoTema.id = crypto.randomUUID();
    nuevoTema.nombre = nuevoTema.nombre + " (copia)";

    // 3. Regenerar IDs de subtemas y módulos
    nuevoTema.subtemas = nuevoTema.subtemas.map(st => {
        const nuevo = { ...st, id: crypto.randomUUID() };
        nuevo.modulos = (st.modulos || []).map(m => ({
            ...m,
            id: crypto.randomUUID()
        }));
        return nuevo;
    });

    // 4. Insertar después del original
    const index = curso.temas.indexOf(temaOriginal);
    curso.temas.splice(index + 1, 0, nuevoTema);

    // 5. Guardar
    await guardarCursoFirebase();

    // 6. Renderizar
    renderTemas();
}




/* EDITAR SUBTEMA EN EL EDITOR */
async function cargarSubtema(subtema, moduloIdToScroll = null, modoLectura = false) {
    // HACER SUBTEMA GLOBAL PARA OTROS ARCHIVOS
    window.subtemaActivo = subtema;
    // Guardar en localStorage
    localStorage.setItem("subtemaAbierto", subtema.id);
    
    // Buscar el tema padre y guardarlo también
    const temaPadre = curso.temas.find(t => 
        t.subtemas?.some(s => s.id === subtema.id)
    );

    if (temaPadre) {
        localStorage.setItem("temaAbierto", temaPadre.id);
        window.temaActivo = temaPadre;
    }

    // 🔥 CORRECCIÓN: Determinar si estamos en modo lectura
    const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
    
    // 🔥 IMPORTANTE: Para cursos duplicados, siempre deberían ser editables
    let puedeEditar = true;
    if (cursoActual) {
        puedeEditar = cursoActual.esPropio || cursoActual.permisos?.editar === true;
        
        // Verificar si es un curso duplicado (por el nombre o algún indicador)
        if (cursoActual.nombre && cursoActual.nombre.includes("(Copia)")) {
            puedeEditar = true; // Forzar modo edición para copias
        }
    }
    
    const esModoLectura = modoLectura || !puedeEditar;
    
    contenidoEditor.innerHTML = `
    <div class="flex items-center justify-between mb-6">
        <h2 class="text-sm font-semibold text-gray-900">${subtema.nombre}</h2>
        <div class="flex items-center gap-3">
            ${!esModoLectura ? `
                <button class="icon-btn" id="btnAddModulo" title="Añadir módulo">
                    <i class="fas fa-plus"></i>
                </button>
                <!-- NUEVO ICONO: INSTRUCCIONES GEMINI -->
                <button class="icon-btn" id="btnInstruccionesSubtema" title="Ver instrucciones del subtema">
                    <i class="fas fa-comment-dots text-purple-600"></i>
                </button>
                <button class="icon-btn" id="btnGenerar" title="Generar contenido con IA">
                    <i class="fas fa-magic"></i>
                </button>
                <button class="icon-btn" id="btnTraducirSubtema" title="Traducir contenido generado">
                    <i class="fas fa-language"></i>
                </button>
            ` : `
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                    <i class="fas fa-eye mr-1"></i>Solo lectura
                </span>
            `}
        </div>
    </div>

            <!-- Contenido generado -->
            <div class="mb-8">
                <label class="section-title">Contenido generado</label>
                <div id="resultadoGenerado" 
                    class="p-4 bg-card rounded-md border border-border text-foreground generated-content ${esModoLectura ? 'readonly-content' : 'contenido-editable'}" 
                    contenteditable="${!esModoLectura}">
                    ${subtema.contenidoGenerado || '<span class="text-muted-foreground text-xs">Sin contenido generado</span>'}
                </div>
            </div>

            <!-- Módulos -->
            <div class="mt-4">
                <label class="section-title">Módulos de este subtema</label>
                <div id="listaModulos" class="space-y-3 mt-3">
                    ${await renderModulosHTML(subtema, moduloIdToScroll, esModoLectura)}
                </div>
            </div>
        `;

    // Solo volver arriba si no se pidió ir a un módulo específico
    if (!moduloIdToScroll) {
        contenidoEditor.scrollTo({ top: 0, behavior: "auto" });
    }

    // 🔥 CORRECCIÓN: Agregar eventos de guardado para instrucciones y contenido generado
    if (!esModoLectura) {
        // Evento para guardar instrucciones
        const instruccionesDiv = document.getElementById("instruccionesSubtema");
        if (instruccionesDiv) {
            instruccionesDiv.addEventListener("blur", async (e) => {
                const contenido = e.target.innerHTML;
                // Limpiar el placeholder si existe
                if (contenido.includes('Sin instrucciones - haz clic para editar')) {
                    subtema.instrucciones = "";
                } else {
                    subtema.instrucciones = contenido;
                }
                await guardarCursoFirebase();
            });
            
            // También guardar al presionar Ctrl+Enter
            instruccionesDiv.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    const contenido = instruccionesDiv.innerHTML;
                    subtema.instrucciones = contenido;
                    await guardarCursoFirebase();
                    instruccionesDiv.blur();
                }
            });
        }

        // Evento para guardar contenido generado
        const resultadoDiv = document.getElementById("resultadoGenerado");
        if (resultadoDiv) {
            resultadoDiv.addEventListener("blur", async (e) => {
                subtema.contenidoGenerado = e.target.innerHTML;
                await guardarCursoFirebase();
            });
            
            resultadoDiv.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    subtema.contenidoGenerado = resultadoDiv.innerHTML;
                    await guardarCursoFirebase();
                    resultadoDiv.blur();
                }
            });
        }

        // NUEVO: Botón para abrir modal de instrucciones
        const btnInstrucciones = document.getElementById("btnInstruccionesSubtema");
        if (btnInstrucciones) {
            btnInstrucciones.addEventListener("click", () => {
                abrirModalInstruccionesSubtema(subtema);
            });
        }

    }

    // 🔥 CORRECCIÓN: Solo activar edición para módulos si no es modo lectura
    if (!esModoLectura) {
        setTimeout(() => {
            document.querySelectorAll('.contenido-editable').forEach(contenedor => {
                // Doble clic para activar/desactivar edición completa del módulo
                if (contenedor.dataset.moduloId) {
                    contenedor.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        const moduloId = this.dataset.moduloId;
                        
                        if (moduloEditandoCompleto === moduloId) {
                            desactivarEdicionModuloCompleto();
                        } else {
                            activarEdicionModuloCompleto(moduloId);
                        }
                    });

                    // Clic simple para seleccionar
                    contenedor.addEventListener('click', function(e) {
                        const moduloId = this.dataset.moduloId;
                        
                        if (moduloEditandoCompleto !== moduloId) {
                            document.querySelectorAll('.contenido-editable').forEach(el => {
                                el.classList.remove('modulo-seleccionado');
                            });
                            
                            this.classList.add('modulo-seleccionado');
                            localStorage.setItem("moduloActivo", moduloId);
                        }
                    });

                    // Guardado automático del contenido del módulo al editar.
                    if (!contenedor.dataset.autosaveBound) {
                        contenedor.dataset.autosaveBound = "1";

                        const guardarModuloDesdeContenedor = async (forzar = false) => {
                            const modId = contenedor.dataset.moduloId;
                            if (!modId) return;

                            const html = contenedor.innerHTML;
                            const ultimo = contenedor.dataset.lastSavedHtml || "";
                            if (!forzar && html === ultimo) return;

                            try {
                                await guardarModulo(modId, { contenido: html });
                                contenedor.dataset.lastSavedHtml = html;

                                const spinner = document.getElementById(`spinner-${modId}`);
                                if (spinner) {
                                    spinner.classList.remove("hidden");
                                    spinner.innerHTML = `<span class="text-green-600 text-xs">✓ Guardado</span>`;
                                    setTimeout(() => spinner.classList.add("hidden"), 1200);
                                }
                            } catch (_) {
                                const spinner = document.getElementById(`spinner-${modId}`);
                                if (spinner) {
                                    spinner.classList.remove("hidden");
                                    spinner.innerHTML = `<span class="text-red-600 text-xs">✗ Error al guardar</span>`;
                                    setTimeout(() => spinner.classList.add("hidden"), 1800);
                                }
                            }
                        };

                        contenedor.addEventListener("input", () => {
                            const modId = contenedor.dataset.moduloId;
                            if (!modId) return;

                            const prevTimer = moduloAutosaveTimers.get(modId);
                            if (prevTimer) clearTimeout(prevTimer);

                            const timer = setTimeout(() => {
                                guardarModuloDesdeContenedor(false);
                                moduloAutosaveTimers.delete(modId);
                            }, 900);

                            moduloAutosaveTimers.set(modId, timer);
                        });

                        contenedor.addEventListener("blur", () => {
                            const modId = contenedor.dataset.moduloId;
                            if (modId && moduloAutosaveTimers.has(modId)) {
                                clearTimeout(moduloAutosaveTimers.get(modId));
                                moduloAutosaveTimers.delete(modId);
                            }
                            guardarModuloDesdeContenedor(true);
                        });

                        contenedor.addEventListener("keydown", (e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                                e.preventDefault();
                                guardarModuloDesdeContenedor(true);
                            }
                        });
                    }
                }
            });
        }, 100);
    }

    // Scroll rápido y robusto al módulo objetivo (id interno o compuesto)
    if (moduloIdToScroll) {
        const scrollIds = [
            moduloIdToScroll,
            String(moduloIdToScroll).includes('_') ? String(moduloIdToScroll).split('_').pop() : null
        ].filter(Boolean);

        const buscarYScroll = () => {
            for (const id of scrollIds) {
                const moduloDiv = document.getElementById(`modulo-${id}`);
                if (!moduloDiv) continue;

                localStorage.setItem("moduloActivo", id);
                moduloDiv.scrollIntoView({
                    behavior: 'auto',
                    block: 'start',
                    inline: 'nearest'
                });
                moduloDiv.classList.add('highlight-pulse');
                setTimeout(() => moduloDiv.classList.remove('highlight-pulse'), 900);
                return true;
            }
            return false;
        };

        // Intentar inmediatamente y luego en próximos frames por si aún no pintó el nodo
        if (!buscarYScroll()) {
            let intentos = 0;
            const maxIntentos = 12;
            const tick = () => {
                intentos += 1;
                if (buscarYScroll() || intentos >= maxIntentos) return;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
    }

    // 🔥 CORRECCIÓN: Solo habilitar botones si no es modo lectura
    if (!esModoLectura) {
        // Generar contenido - CORREGIR EL ERROR AQUÍ
        const btnGenerar = document.getElementById("btnGenerar");
if (btnGenerar) {
    btnGenerar.addEventListener("click", async () => {
        // Obtener los elementos necesarios del DOM
        const instruccionesDiv = document.getElementById("instruccionesSubtema");
        const resultadoDiv = document.getElementById("resultadoGenerado");
        const subtemaActual = window.subtemaActivo;
        
        if (!instruccionesDiv || !resultadoDiv || !subtemaActual) {
            alert("Error: No se pudo encontrar el contenido para generar. Asegúrate de tener un subtema seleccionado.");
            return;
        }
        
        // Obtener el curso actual para verificar permisos
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        
        // Verificar permisos
        if (cursoActual && !cursoActual.esPropio && !cursoActual.permisos?.editar) {
            alert("No tienes permisos para generar contenido en este curso.");
            return;
        }
        
        if (typeof generarContenidoGemini === 'function') {
            // Pasar los elementos necesarios como parámetros
            await generarContenidoGemini({
                instruccionesDiv: instruccionesDiv,
                resultadoDiv: resultadoDiv,
                subtema: subtemaActual,
                cursoId: cursoDocId,
                userId: currentUserId
            });
        } else {
            alert("Error: No se puede generar contenido en este momento.");
        }
    });
}


        // Traducir subtema
        const btnTraducir = document.getElementById("btnTraducirSubtema");
        if (btnTraducir) {
            btnTraducir.onclick = () => {
                window.__subtemaTraduciendo = subtema;
                window.renderListadoTraduccionesSubtema(subtema);

                const modal = document.getElementById("modalTraducirSubtema");
                const select = document.getElementById("selectIdiomaSubtema");
                const contPrev = document.getElementById("contenidoTraduccionSubtema");

                select.value = "";
                contPrev.innerHTML = `<p class="text-muted-foreground text-sm">Aquí aparecerá la traducción del contenido generado.</p>`;

                modal.classList.remove("hidden");
                modal.classList.add("flex");
            };
        }

        // Añadir módulo
        const btnAddModulo = document.getElementById("btnAddModulo");
        if (btnAddModulo) {
            btnAddModulo.addEventListener("click", () => {
                mostrarSelectorModulo(subtema);
            });
        }
    }

    // Activar sistema de edición solo si no es modo lectura
    if (!esModoLectura) {
        setTimeout(() => activarAccionesEnParrafos(), 50);
        setTimeout(() => iniciarTourBotonesModuloSiAplica(), 280);
    }
}

/* ============================================================
   MODAL PARA INSTRUCCIONES DEL SUBTEMA
============================================================ */

async function abrirModalInstruccionesSubtema(subtema) {
    // Crear modal si no existe
    if (!document.getElementById("modalInstruccionesSubtema")) {
        crearModalInstruccionesSubtema();
    }
    
    const modal = document.getElementById("modalInstruccionesSubtema");
    const tituloModal = document.getElementById("tituloInstruccionesSubtema");
    const instruccionesDiv = document.getElementById("instruccionesSubtema");
    const btnGuardar = document.getElementById("btnGuardarInstruccionesSubtema");
    
    // Configurar el modal
    tituloModal.textContent = `Instrucciones: ${subtema.nombre}`;
    
    // Cargar instrucciones actuales
    instruccionesDiv.innerHTML = subtema.instrucciones || 
        '<p class="text-muted-foreground text-sm">Escribe las instrucciones para este subtema aquí...</p>';
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar el contenido editable
    setTimeout(() => {
        if (instruccionesDiv.textContent.includes("Escribe las instrucciones")) {
            instruccionesDiv.focus();
            // Seleccionar todo para facilitar la edición
            const range = document.createRange();
            range.selectNodeContents(instruccionesDiv);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 100);
    
    // Configurar evento para guardar
    const guardarInstrucciones = async () => {
        const contenido = instruccionesDiv.innerHTML;
        
        // Evitar guardar si es el placeholder
        if (contenido.includes("Escribe las instrucciones")) {
            subtema.instrucciones = "";
        } else {
            subtema.instrucciones = contenido;
        }
        
        await guardarCursoFirebase();
        
        // Cerrar modal
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        
        // Notificar
        mostrarNotificacion("✅ Instrucciones guardadas correctamente", 'success');
    };
    
    // Limpiar eventos previos
    btnGuardar.onclick = null;
    
    // Asignar nuevo evento
    btnGuardar.onclick = guardarInstrucciones;
    
    // También permitir Ctrl+Enter para guardar
    instruccionesDiv.onkeydown = (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            guardarInstrucciones();
        }
        
        // Escape para cancelar
        if (e.key === "Escape") {
            modal.classList.add("hidden");
            modal.classList.remove("flex");
        }
    };
}

function crearModalInstruccionesSubtema() {
    const modalHTML = `
        <div id="modalInstruccionesSubtema" class="modal fixed inset-0 bg-black/45 backdrop-blur-sm z-[10000] hidden items-center justify-center">
            <div class="bg-card text-foreground border border-border rounded-lg p-6 w-full max-w-3xl cb-modal-panel-scroll">
                <!-- Encabezado -->
                <div class="flex items-center justify-between mb-4">
                    <h3 id="tituloInstruccionesSubtema" class="text-lg font-semibold"></h3>
                    <button class="text-muted-foreground hover:text-foreground" onclick="document.getElementById('modalInstruccionesSubtema').classList.add('hidden')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Contenedor de instrucciones -->
                <div class="flex-1 overflow-y-auto mb-4">
                    <div id="instruccionesSubtema" 
                         class="p-4 border border-input rounded min-h-[300px] contenido-editable text-foreground" 
                         contenteditable="true"
                         data-placeholder="Escribe las instrucciones para este subtema aquí...">
                    </div>
                </div>
                
                <!-- Pie del modal -->
                <div class="flex justify-between items-center pt-4 border-t border-border">
                    <div class="text-xs text-muted-foreground">
                        <i class="fas fa-lightbulb mr-1"></i>
                        Usa este espacio para escribir instrucciones detalladas sobre el subtema
                    </div>
                    <div class="flex gap-2">
                        <button id="btnGuardarInstruccionesSubtema"
                                class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
                            <i class="fas fa-save mr-2"></i> Guardar Instrucciones
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}


// Después de las importaciones, agrega:
window.ejecutarGeneracionModuloGemini = async function (moduloId) {
    try {
        await generarModuloGemini(moduloId);   // ← SOLO 1 parámetro
        cargarSubtema(subtemaActivo);          // refrescar UI
    } catch (err) {
        alert("Error al generar contenido con IA.");
    }
};



// Modifica la llamada en renderModulosHTML para que pase correctamente los parámetros:
async function renderModulosHTML(subtema, moduloActivoId = null, modoLectura = false) {
    // Verificar si es curso duplicado
    const esCursoDuplicado = curso?.nombre?.includes("(Copia)") || false;
    
    // Si es curso duplicado, forzar modo edición
    const esModoLecturaReal = modoLectura && !esCursoDuplicado;

    if (!subtema.modulosIds || subtema.modulosIds.length === 0) {
        return `<p class="text-gray-400 text-xs">No hay módulos.</p>`;
    }

    const modulosCargados = await Promise.all(
        subtema.modulosIds.map(async (modId) => {
            const mod = await obtenerModulo(modId, curso.id);
            return { modId, mod };
        })
    );

    let html = "";

    for (const { modId, mod } of modulosCargados) {
        if (!mod) continue;
        if (mod.archivado && !mostrarModulosArchivados) continue;

        const esActivo = modId === moduloActivoId || mod.id === moduloActivoId;

        html += `
<div class="p-4 border rounded-md bg-white shadow-sm hover:bg-gray-50 transition
    ${esActivo ? 'modulo-activo highlight-pulse' : ''}" 
    id="modulo-${mod.id}"
    data-modulo-archivado="${mod.archivado ? "true" : "false"}">

    <div class="flex justify-between items-start">
    
        <!-- TÍTULO DEL MÓDULO -->
        <div>
            <p class="font-semibold ${esActivo ? 'text-blue-900' : 'text-gray-800'}">${mod.nombre}</p>
            <p class="text-xs text-gray-500">${mod.tipo}</p>
        </div>

        <!-- 🔥 CORRECCIÓN: Mostrar íconos solo si no es modo lectura REAL -->
        ${!esModoLecturaReal ? `
        <div class="flex items-center gap-3 text-sm">
            <label class="modulo-archive-switch" title="Archivar módulo" aria-label="Archivar módulo" data-tour="archivar">
                <input type="checkbox" class="cb-switch-archivar-modulo cb-switch-archivar-modulo-hidden"
                       ${mod.archivado ? "checked" : ""}
                       onchange="window.toggleArchivoModulo('${mod.id}', this.checked)">
                <span class="modulo-archive-switch__track" aria-hidden="true">
                    <span class="modulo-archive-switch__thumb"></span>
                </span>
                <span class="modulo-archive-switch__label">Archivar</span>
            </label>

            <!-- NUEVO ICONO: NOTAS PARA EL MAESTRO -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Notas del maestro"
                    aria-label="Notas del maestro"
                    data-tour="notas-maestro"
                    onclick="abrirModalNotasMaestro('${mod.id}')">
                <i class="fas fa-chalkboard-teacher text-green-600"></i>
            </button>
            
            <!-- ANALIZAR -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Analizar módulo"
                    aria-label="Analizar módulo"
                    data-tour="analizar-modulo"
                    onclick="analizarModulo('${mod.id}')">
                <i class="fas fa-search text-orange-500"></i>
            </button>

            <!-- INSTRUCCIONES GEMINI -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Instrucciones IA"
                    aria-label="Instrucciones IA"
                    data-tour="instrucciones-ia"
                    onclick="abrirInstruccionesGemini('${mod.id}')">
                <i class="fas fa-comment-dots text-purple-600"></i>
            </button>

            <!-- GENERAR IA -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Generar con IA"
                    aria-label="Generar con IA"
                    data-tour="generar-ia"
                    onclick="ejecutarGeneracionModuloGemini('${mod.id}')">
                <i class="fas fa-magic text-blue-600"></i>
            </button>
            
            <!-- CAMBIAR TONO DEL CONTENIDO -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Cambiar tono del contenido"
                    aria-label="Cambiar tono del contenido"
                    data-tour="cambiar-tono"
                    onclick="abrirModalTono('${mod.id}')">
                <i class="fas fa-adjust text-pink-600"></i>
            </button>
            
            <!-- CREAR TABLA -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Crear tabla a partir del contenido"
                    aria-label="Crear tabla a partir del contenido"
                    data-tour="crear-tabla"
                    onclick="abrirModalCrearTabla('${mod.id}')">
                <i class="fas fa-table text-indigo-500"></i>
            </button>

            <!-- TRADUCIR -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Traducir módulo"
                    aria-label="Traducir módulo"
                    data-tour="traducir-modulo"
                    onclick="traducirModulo('${mod.id}')">
                <i class="fas fa-language text-teal-600"></i>
            </button>

            <!-- ELIMINAR MÓDULO -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Eliminar módulo"
                    aria-label="Eliminar módulo"
                    data-tour="eliminar-modulo"
                    onclick="if (confirm('¿Eliminar módulo?')) { window.eliminarModulo('${mod.id}'); }">
                <i class="fas fa-trash text-red-600"></i>
            </button>
        </div>
        ` : ''}
    </div>

    <!-- CONTENIDO DEL MÓDULO -->
    <div class="mt-3">
        <div id="spinner-${mod.id}" class="text-blue-600 text-xs mb-2 hidden"></div>

        <!-- 🔥 CORRECCIÓN CRUCIAL: Usar esModoLecturaReal en lugar de modoLectura -->
        <div class="p-3 bg-gray-50 border border-gray-200 rounded modulo-contenido ${!esModoLecturaReal ? 'contenido-editable' : ''}" 
             id="contenido-${mod.id}"
             data-modulo-id="${mod.id}"
             contenteditable="${!esModoLecturaReal}">
            ${renderizarContenidoModulo(mod.contenido)}
        </div>
    </div>

</div>
`;
    }

    if (!html.trim()) {
        return `<p class="text-gray-400 text-xs">No hay módulos.</p>`;
    }

    return html;
}

window.toggleArchivoModulo = async function(moduloId, archivado) {
    try {
        await guardarModulo(moduloId, { archivado: !!archivado });

        if (archivado) {
            const activo = localStorage.getItem("moduloActivo");
            if (activo === moduloId || (activo && moduloId.includes('_') && moduloId.split('_').pop() === activo)) {
                localStorage.removeItem("moduloActivo");
            }
        }

        if (subtemaActivo) {
            await cargarSubtema(subtemaActivo);
        }
        renderTemas();
    } catch (_) {
        alert("No se pudo actualizar el estado de archivo del módulo.");
    }
};

const TOUR_ACCIONES_MODULO_STEPS = [
    {
        key: "instrucciones-ia",
        titulo: "Añadir instrucción IA",
        texto: "En módulos tipo quiz u otros, puedes añadir las preguntas que quieras rehacer con el formato necesario para ser incluido en la plataforma Aprende."
    },
    {
        key: "generar-ia",
        titulo: "Generar con IA",
        texto: "Genera automáticamente contenido del módulo a partir de las instrucciones."
    },
    {
        key: "notas-maestro",
        titulo: "Notas del maestro",
        texto: "Si quieres crear notas del maestro de algún ejercicio o tema deseado, usa esta opción."
    },
    {
        key: "cambiar-tono",
        titulo: "Cambiar tono del contenido",
        texto: "Ajusta el tono de redacción: académico, científico u otros."
    },
    {
        key: "crear-tabla",
        titulo: "Crear tabla",
        texto: "Crea una tabla estructurada a partir del contenido actual del módulo."
    },
    {
        key: "traducir-modulo",
        titulo: "Traducir módulo",
        texto: "Traduce el módulo a diferentes idiomas."
    },
    {
        key: "analizar-modulo",
        titulo: "Analizar módulo",
        texto: "Revisa si el texto es coherente y detecta mejoras."
    },
    {
        key: "archivar",
        titulo: "Archivar",
        texto: "Archiva un módulo para ocultarlo; tampoco se incluirá en la descarga Word."
    },
    {
        key: "eliminar-modulo",
        titulo: "Eliminar módulo",
        texto: "Elimina el módulo cuando ya no lo necesites."
    }
];

function obtenerTourAccionesModuloOverlay() {
    let overlay = document.getElementById("cbTourAccionesModulo");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "cbTourAccionesModulo";
    overlay.className = "cb-tour-overlay hidden";
    overlay.innerHTML = `
        <div class="cb-tour-backdrop"></div>
        <div class="cb-tour-tooltip" role="dialog" aria-live="polite" aria-label="Guía de acciones del módulo">
            <div class="cb-tour-step"></div>
            <h4 class="cb-tour-title"></h4>
            <p class="cb-tour-body"></p>
            <div class="cb-tour-actions">
                <button type="button" class="cb-tour-btn cb-tour-btn-skip" id="cbTourSkip">Skip</button>
                <button type="button" class="cb-tour-btn cb-tour-btn-next" id="cbTourNext">Siguiente</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#cbTourSkip")?.addEventListener("click", () => {
        finalizarTourAccionesModulo("skip");
    });
    overlay.querySelector("#cbTourNext")?.addEventListener("click", () => {
        avanzarTourAccionesModulo();
    });

    return overlay;
}

function limpiarHighlightTourAccionesModulo() {
    if (tourAccionesModuloTarget) {
        tourAccionesModuloTarget.classList.remove("cb-tour-target-highlight");
    }
    tourAccionesModuloTarget = null;
}

function encontrarTargetTourAccionesModulo(stepKey) {
    return document.querySelector(`#listaModulos [data-tour="${stepKey}"]`);
}

function posicionarTooltipTourAccionesModulo(target) {
    const overlay = document.getElementById("cbTourAccionesModulo");
    if (!overlay) return;

    const tooltip = overlay.querySelector(".cb-tour-tooltip");
    if (!tooltip) return;

    const rect = target.getBoundingClientRect();
    const gap = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + gap;
    if (top + tooltipRect.height > viewportH - 8) {
        top = Math.max(8, rect.top - tooltipRect.height - gap);
    }

    let left = rect.left;
    if (left + tooltipRect.width > viewportW - 8) {
        left = viewportW - tooltipRect.width - 8;
    }
    left = Math.max(8, left);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
}

function renderPasoTourAccionesModulo() {
    if (!tourAccionesModuloActivo) return;

    const overlay = obtenerTourAccionesModuloOverlay();
    const step = TOUR_ACCIONES_MODULO_STEPS[tourAccionesModuloPaso];
    if (!step) {
        finalizarTourAccionesModulo("done");
        return;
    }

    const target = encontrarTargetTourAccionesModulo(step.key);
    if (!target) {
        avanzarTourAccionesModulo(true);
        return;
    }

    limpiarHighlightTourAccionesModulo();
    tourAccionesModuloTarget = target;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    target.classList.add("cb-tour-target-highlight");

    const total = TOUR_ACCIONES_MODULO_STEPS.length;
    const stepLabel = overlay.querySelector(".cb-tour-step");
    const stepTitle = overlay.querySelector(".cb-tour-title");
    const stepBody = overlay.querySelector(".cb-tour-body");
    const btnNext = overlay.querySelector("#cbTourNext");

    if (stepLabel) stepLabel.textContent = `Paso ${tourAccionesModuloPaso + 1} de ${total}`;
    if (stepTitle) stepTitle.textContent = step.titulo;
    if (stepBody) stepBody.textContent = step.texto;
    if (btnNext) btnNext.textContent = tourAccionesModuloPaso === total - 1 ? "Aceptar" : "Siguiente";

    overlay.classList.remove("hidden");
    requestAnimationFrame(() => posicionarTooltipTourAccionesModulo(target));
}

function avanzarTourAccionesModulo(saltandoTarget = false) {
    if (!tourAccionesModuloActivo) return;

    const total = TOUR_ACCIONES_MODULO_STEPS.length;
    if (!saltandoTarget) {
        tourAccionesModuloPaso += 1;
    } else {
        tourAccionesModuloPaso += 1;
    }

    if (tourAccionesModuloPaso >= total) {
        finalizarTourAccionesModulo("done");
        return;
    }
    renderPasoTourAccionesModulo();
}

function finalizarTourAccionesModulo(estadoFinal) {
    const overlay = document.getElementById("cbTourAccionesModulo");
    if (overlay) {
        overlay.classList.add("hidden");
    }
    limpiarHighlightTourAccionesModulo();
    tourAccionesModuloActivo = false;
    tourAccionesModuloPaso = 0;
    localStorage.setItem(TOUR_MODULOS_STORAGE_KEY, estadoFinal);
}

function iniciarTourBotonesModuloSiAplica() {
    const estado = localStorage.getItem(TOUR_MODULOS_STORAGE_KEY);
    if (estado === "done" || estado === "skip") return;
    if (tourAccionesModuloActivo) return;
    if (tourAccionesModuloMostradoEnSesion) return;

    const primerTarget = encontrarTargetTourAccionesModulo("instrucciones-ia");
    if (!primerTarget) return;

    tourAccionesModuloMostradoEnSesion = true;
    tourAccionesModuloActivo = true;
    tourAccionesModuloPaso = 0;
    renderPasoTourAccionesModulo();
}

window.addEventListener("resize", () => {
    if (tourAccionesModuloActivo && tourAccionesModuloTarget) {
        posicionarTooltipTourAccionesModulo(tourAccionesModuloTarget);
    }
});

document.addEventListener("scroll", () => {
    if (tourAccionesModuloActivo && tourAccionesModuloTarget) {
        posicionarTooltipTourAccionesModulo(tourAccionesModuloTarget);
    }
}, true);


// Variable global para almacenar el ID del módulo actual para notas del maestro
let moduloNotasMaestroId = null;

const ORDINALES = [
  "primera", "segunda", "tercera", "cuarta", "quinta", "sexta",
  "séptima", "septima",
  "octava", "novena", "décima", "decima",
  "undécima", "onceava",
  "duodécima", "doceava",
  "decimotercera", "decimocuarta", "decimoquinta"
];

const REGEX_ORDINALES = new RegExp(`\\b(${ORDINALES.join("|")})\\b`, "i");


function normalizarTipoModulo(tipo) {
  if (!tipo) return "contenido";

  const t = tipo.toLowerCase();

  if (t.includes("quiz")) return "quiz";
  if (t.includes("notas del maestro")) return "notas_maestro";
  if (t.includes("lección") || t.includes("leccion")) return "leccion";
  if (t.includes("página") || t.includes("pagina")) return "pagina";
  if (t.includes("libro")) return "libro";

  return "contenido";
}

const PERFILES_IDIOMA_NOTAS = [
  {
    code: "es",
    label: "español",
    words: [" el ", " la ", " los ", " las ", " para ", " con ", " que ", " una ", " del ", " actividad ", " estudiantes ", " aprendizaje ", " objetivo "]
  },
  {
    code: "en",
    label: "english",
    words: [" the ", " and ", " for ", " with ", " this ", " should ", " students ", " learning ", " objective ", " activity ", " lesson ", " write ", " explain "]
  },
  {
    code: "pt",
    label: "português",
    words: [" de ", " para ", " com ", " os ", " as ", " alunos ", " aprendizagem ", " objetivo ", " atividade ", " aula ", " texto "]
  },
  {
    code: "fr",
    label: "français",
    words: [" le ", " la ", " les ", " des ", " pour ", " avec ", " et ", " eleves ", " apprentissage ", " objectif ", " activite ", " cours "]
  }
];

function normalizarTextoIdiomaNotas(texto = "") {
  return ` ${String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function detectarIdiomaParaNotas(texto = "") {
  const normalizado = normalizarTextoIdiomaNotas(texto);
  if (!normalizado.trim()) {
    return { code: "es", label: "español", confidence: 0 };
  }

  const scores = PERFILES_IDIOMA_NOTAS.map((perfil) => {
    let score = 0;
    for (const token of perfil.words) {
      if (normalizado.includes(token)) score += 1;
    }
    return { ...perfil, score };
  }).sort((a, b) => b.score - a.score);

  const mejor = scores[0];
  const segundo = scores[1] || { score: 0 };

  if (!mejor || mejor.score === 0 || (mejor.score - segundo.score) < 1) {
    return { code: "es", label: "español", confidence: 0.25 };
  }

  return {
    code: mejor.code,
    label: mejor.label,
    confidence: Number((mejor.score / Math.max(1, mejor.score + segundo.score)).toFixed(2))
  };
}

function aplicarReglaIdiomaEnPromptNotas(promptBase, idiomaDetectado) {
  return `
IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado del módulo: ${idiomaDetectado.label} (${idiomaDetectado.code}).
- Escribe TODA la respuesta final en ${idiomaDetectado.label}.
- No traduzcas al español si el idioma detectado no es español.
- Mantén terminología pedagógica natural del idioma detectado.

${promptBase}
`;
}

// Función para abrir el modal de Notas para el Maestro
window.abrirModalNotasMaestro = async function(moduloId) {
    moduloNotasMaestroId = moduloId;
    
    const modal = document.getElementById("modalNotasMaestro");
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Ocultar botón de regenerar inicialmente
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.add("hidden");
    }
    
    // Resetear botón de guardar
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
    
    // Mostrar loading
    contenidoModal.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-blue-500 text-2xl mb-2"></i>
                <p class="text-gray-600 text-sm">Cargando notas del maestro...</p>
            </div>
        </div>
    `;
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Verificar si ya hay notas guardadas
    const modulo = await obtenerModulo(moduloId);
    
    if (modulo && modulo.notasMaestro) {
        // Mostrar notas guardadas
        mostrarNotasGuardadas(modulo);
    } else {
        // Generar nuevas notas
        await generarNotasMaestroConIA(moduloId, modulo?.contenido || "");
    }
};

// Función para mostrar notas guardadas
function mostrarNotasGuardadas(modulo) {
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    if (!contenidoModal) return;
    
    // Mostrar las notas guardadas
    contenidoModal.innerHTML = modulo.notasMaestro;
    
    // Mostrar fecha de generación si existe
    if (modulo.notasMaestroGenerado) {
        const fecha = new Date(modulo.notasMaestroGenerado).toLocaleString();
        const fechaDiv = document.createElement('div');
        fechaDiv.className = "text-xs text-gray-500 mt-4 text-center";
        fechaDiv.innerHTML = `<i class="fas fa-clock mr-1"></i> Generado: ${fecha}`;
        contenidoModal.appendChild(fechaDiv);
    }
    
    // Habilitar botón de guardar (para actualizar)
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Actualizar Notas';
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = false;
    }
    
    // Mostrar botón de regenerar
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.remove("hidden");
    }
    
    // Aplicar estilos
    aplicarEstilosNotas();
}

// Función para regenerar las notas
window.regenerarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) return;
    
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Deshabilitar botones temporalmente
    if (btnRegenerarNotas) btnRegenerarNotas.disabled = true;
    if (btnGuardarNotas) btnGuardarNotas.disabled = true;
    if (btnAplicarNotas) btnAplicarNotas.disabled = true;
    
    // Mostrar loading
    contenidoModal.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="text-center">
                <i class="fas fa-sync-alt fa-spin text-blue-500 text-2xl mb-2"></i>
                <p class="text-gray-600 text-sm">Regenerando notas del maestro...</p>
            </div>
        </div>
    `;
    
    // Obtener contenido actual del módulo
    const contElement = document.getElementById(`contenido-${moduloNotasMaestroId}`);
    let contenidoModulo = "";
    
    if (contElement) {
        contenidoModulo = contElement.innerHTML;
    } else {
        const modulo = await obtenerModulo(moduloNotasMaestroId);
        contenidoModulo = modulo?.contenido || "";
    }
    
    // Generar nuevas notas
    await generarNotasMaestroConIA(moduloNotasMaestroId, contenidoModulo);
    
    // Re-habilitar botones
    if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
};

// Función para generar notas académicas para el maestro (VERSIÓN SIMPLIFICADA)
async function generarNotasMaestroConIA(moduloId, contenidoModulo) {
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    try {
        // Obtener información del módulo
        const modulo = await obtenerModulo(moduloId);
        if (!modulo) {
            throw new Error("No se encontró el módulo");
        }
        
        // Obtener el contenido del módulo
        let contenidoHTML = "";
        const contElement = document.getElementById(`contenido-${moduloId}`);
        
        if (contElement) {
            contenidoHTML = contElement.innerHTML;
        } else {
            contenidoHTML = modulo.contenido || contenidoModulo || "";
        }
        
        // Limpiar y extraer el texto para análisis
        const contenidoLimpio = extraerTextoParaAnalisis(contenidoHTML);
        const idiomaDetectado = detectarIdiomaParaNotas(
            `${modulo?.nombre || ""}\n${modulo?.instrucciones || ""}\n${contenidoLimpio || ""}`
        );
        
        // Determinar el tipo de contenido
        const tipoModulo = modulo.tipo || "actividad";

        const { modo, preguntasDetectadas } = detectarModoNotasMaestro({
            tipoModulo,
            contenidoHTML,
            contenidoLimpio
        });

                
        // Construir prompt simple y directo
        const endpoint = getGeminiEndpoint();
        const totalPreguntas =
            (contenidoLimpio.match(/\?/g) || []).length;
        // Detectar número REAL de preguntas del quizz
        

        // Construcción del prompt CORREGIDO
        let prompt = "";

        if (modo === "quiz") {
        prompt = construirPromptQuizz({
            preguntasDetectadas,
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio
        });
        } 
        else if (modo === "leccion") {
        prompt = construirPromptLeccion({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio,
            preguntasDetectadas
        });
        } 
        else if (modo === "actividad_guiada") {
        prompt = construirPromptActividadGuiada({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio
        });
        }
        else {
        prompt = construirPromptContenido({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio
        });
        }

        prompt = aplicarReglaIdiomaEnPromptNotas(prompt, idiomaDetectado);

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();
        const notasTexto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudieron generar las notas.";
        const contenidoNotasHTML = renderizarContenidoNotasMaestro(notasTexto);

        // Crear HTML con formato adecuado
        const notasHTML = `
        <div class="notas-maestro-simple space-y-4 text-sm text-slate-700 leading-relaxed">

            <!-- Header -->
            <div class="rounded-lg border bg-background p-4 shadow-sm">
            <div class="flex items-center gap-2 text-base font-semibold text-slate-900">
                <i class="fas fa-book-open text-slate-600"></i>
                Notas pedagógicas para el docente
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
                Orientaciones didácticas generadas a partir del contenido del módulo
            </p>
            </div>

            <!-- Metadata -->
            <div class="rounded-lg border bg-muted/40 p-4">
            <p class="text-xs text-slate-600">
                <span class="font-medium text-slate-900">Módulo analizado:</span>
                ${modulo.nombre || "Sin nombre"}
                <span class="mx-1 text-slate-400">•</span>
                <span class="capitalize">${tipoModulo}</span>
            </p>
            </div>

            <!-- Contenido -->
            <div class="space-y-4 rounded-lg border bg-background p-4">
            ${contenidoNotasHTML}
            </div>

        </div>
        `;

        // Mostrar en el modal
        contenidoModal.innerHTML = notasHTML;
        
        // Habilitar botón de guardar
        if (btnGuardarNotas) {
            btnGuardarNotas.disabled = false;
            btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
        }
        if (btnAplicarNotas) {
            btnAplicarNotas.disabled = false;
        }
        
        // Mostrar botón de regenerar
        if (btnRegenerarNotas) {
            btnRegenerarNotas.classList.remove("hidden");
        }
        
        // Aplicar estilos
        aplicarEstilosNotas();
        
    } catch (error) {
        contenidoModal.innerHTML = `
            <div class="cb-notes-error p-4">
                <p class="font-semibold cb-notes-error-title">Error al generar las notas</p>
                <p class="text-sm mt-2 cb-notes-error-message">${error.message}</p>
                <button onclick="regenerarNotasMaestro()" 
                        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cb-notes-error-button">
                    <i class="fas fa-sync-alt mr-2"></i> Reintentar
                </button>
            </div>
        `;
        if (btnAplicarNotas) {
            btnAplicarNotas.disabled = true;
        }
    }
}

function construirPromptQuizz({
  preguntasDetectadas,
  tipoModulo,
  nombreModulo,
  contenidoLimpio
}) {
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar "Notas para el Maestro" EXCLUSIVAMENTE sobre el siguiente QUIZZ.

REGLAS OBLIGATORIAS:
- El módulo contiene EXACTAMENTE ${preguntasDetectadas} preguntas.
- Genera EXACTAMENTE ${preguntasDetectadas} párrafos, más uno introductorio.
- Cada párrafo corresponde a UNA pregunta real.
- NO inventes actividades ni estaciones.
- NO agregues preguntas inexistentes.

FORMA:
- Usa ordinales: primera, segunda, tercera, etc.
- Tono docente profesional.
- Texto continuo, sin listas.

ESTRUCTURA:
1. Un párrafo introductorio.
2. Un párrafo por pregunta, en orden exacto.

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO DEL QUIZZ:
================================
${contenidoLimpio}
================================

Devuelve SOLO el texto de las notas.
`;
}

function construirPromptContenido({
  tipoModulo,
  nombreModulo,
  contenidoLimpio
}) {
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar "Notas para el Maestro" sobre un MÓDULO DE CONTENIDO (no es un quizz).

OBJETIVO:
Orientar al docente sobre cómo trabajar este contenido en el aula.

REGLAS:
- NO estructures el texto como preguntas.
- NO uses ordinales.
- NO menciones “pregunta”.
- NO inventes actividades que no aparezcan.
- Analiza el contenido como una secuencia didáctica.

ENFÓCATE EN:
- Propósito pedagógico del contenido.
- Conocimientos previos necesarios.
- Cómo abordar el contenido paso a paso.
- Qué ideas clave deben enfatizarse.
- Qué aprendizajes se esperan.

FORMA:
- Tono docente profesional.
- Párrafos continuos.
- Usa expresiones como:
  “Le sugerimos que…”, “Es importante que…”, “Se recomienda…”

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO A ANALIZAR:
================================
${contenidoLimpio}
================================

Devuelve SOLO el texto de las notas del maestro.
`;
}

function construirPromptLeccion({
  tipoModulo,
  nombreModulo,
  contenidoLimpio,
  preguntasDetectadas
}) {
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar "Notas para el Maestro" sobre una LECCIÓN interactiva de Moodle.

OBJETIVO:
Orientar al docente sobre cómo conducir la lección paso a paso,
aprovechando las escenas, el contenido y las preguntas como verificación
del aprendizaje, no como un cuestionario independiente.

REGLAS IMPORTANTES:
- NO trates la lección como un quizz.
- NO uses la palabra “cuestionario”.
- Las preguntas funcionan como puntos de control o verificación.
- NO enumeres preguntas como si fueran un examen.
- NO inventes escenas, actividades ni rutas que no existan.

ENFÓCATE EN:
- Propósito pedagógico general de la lección.
- Importancia de la secuencia de escenas.
- Qué conocimientos previos deben activarse.
- Cómo guiar al alumno durante el procedimiento o narrativa.
- Cómo usar las preguntas para reforzar comprensión y seguridad.
- Qué aprendizajes se esperan al finalizar la lección.

FORMA:
- Tono docente profesional.
- Texto continuo en párrafos.
- NO listas ni viñetas.
- Puedes usar expresiones como:
  “Le sugerimos que…”, “Es importante que…”, “Se recomienda…”

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}
- Cantidad de puntos de verificación: ${preguntasDetectadas}

CONTENIDO DE LA LECCIÓN:
================================
${contenidoLimpio}
================================

Devuelve SOLO el texto de las notas del maestro.
`;
}

function construirPromptActividadGuiada({
  tipoModulo,
  nombreModulo,
  contenidoLimpio
}) {
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar "Notas para el Maestro" para una ACTIVIDAD PRÁCTICA.

OBJETIVO:
Entregar instrucciones claras y accionables para que el docente ejecute la actividad con su grupo.

REGLAS IMPORTANTES:
- Redacta la guía en orden secuencial (inicio, desarrollo y cierre).
- Incluye tiempos sugeridos y qué debe observar el docente en cada etapa.
- Explica cómo acompañar al estudiante si se bloquea o comete errores.
- Incluye una forma simple de evidenciar el aprendizaje al final.
- NO inventes recursos que no estén en el contenido.

ENFÓCATE EN:
- Propósito de la actividad.
- Preparación previa del docente.
- Paso a paso para implementar el ejercicio.
- Preguntas de acompañamiento que puede usar el docente.
- Criterios de logro esperados.

FORMA:
- Tono docente profesional.
- Párrafos claros, concretos y directos.
- Puedes usar expresiones como:
  “Le sugerimos que…”, “Durante esta fase…”, “Al finalizar…”

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO DE LA ACTIVIDAD:
================================
${contenidoLimpio}
================================

Devuelve SOLO el texto de las notas del maestro.
`;
}



// Función para aplicar estilos a las notas
function aplicarEstilosNotas() {
    const contenedor = document.querySelector('.notas-maestro-simple');
    if (!contenedor) return;
    
    // Estilos para párrafos
    const parrafos = contenedor.querySelectorAll('p');
    parrafos.forEach((p, index) => {
        if (index > 0) { // No aplicar al primer párrafo si es el de información
            p.classList.add("cb-notes-paragraph");
            
            // Destacar párrafos con números de preguntas
            const texto = p.textContent.toLowerCase();
            const tieneNumero = REGEX_ORDINALES.test(texto);
            
            if (tieneNumero) {
                p.classList.add("cb-notes-paragraph-question");
            }
            
            // Resaltar números de preguntas
            p.innerHTML = p.innerHTML.replace(
                new RegExp(`\\b(${ORDINALES.join("|")})\\b (\\w+)`, "gi"), 
                '<strong class="cb-notes-ordinal-highlight">$1 $2</strong>'
            );
            
            // Resaltar frases clave
            const frasesClave = ['Le sugerimos que', 'Es importante que', 'Se recomienda'];
            frasesClave.forEach(frase => {
                if (p.textContent.toLowerCase().includes(frase.toLowerCase())) {
                    const regex = new RegExp(frase, 'gi');
                    p.innerHTML = p.innerHTML.replace(regex, `<span class="cb-notes-keyphrase-highlight">$&</span>`);
                }
            });
        }
    });
}

// Funciones auxiliares (mantener igual)
function extraerTextoParaAnalisis(html) {
    if (!html) return "";
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remover elementos de interfaz
    tempDiv.querySelectorAll('.parrafo-actions, .icon-btn, .fa, .btn').forEach(el => el.remove());
    
    // Obtener texto limpio
    const texto = tempDiv.textContent || tempDiv.innerText || "";
    
    // Limpiar espacios extras
    return texto.replace(/\s+/g, ' ').trim();
}

function limpiarYFormatearTexto(texto) {
    if (!texto) return "";
    
    // Limpiar código y marcas
    let textoLimpio = texto
        .replace(/```html/gi, "")
        .replace(/```/g, "")
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .trim();
    
    // Corregir mayúsculas al inicio de párrafos
    const parrafos = textoLimpio.split('\n\n');
    const parrafosCorregidos = parrafos.map(parrafo => {
        let p = parrafo.trim();
        if (p.length === 0) return "";
        
        // Asegurar que empiece con mayúscula
        p = p.charAt(0).toUpperCase() + p.slice(1);
        
        // Asegurar que termine con punto
        if (!p.endsWith('.') && !p.endsWith('!') && !p.endsWith('?')) {
            p += '.';
        }
        
        return p;
    }).filter(p => p.length > 0);
    
    return parrafosCorregidos.join('\n\n');
}

function normalizarTextoNotas(texto) {
    if (!texto) return "";

    let limpio = String(texto)
        .replace(/\r\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();

    // Quitar bloque markdown completo si viene envuelto en ```markdown ... ```
    if (/^```[\w-]*\s*\n[\s\S]*\n```$/m.test(limpio)) {
        limpio = limpio
            .replace(/^```[\w-]*\s*\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
    }

    return limpio;
}

function limpiarBloquesMarkdownEnvolventes(texto) {
    if (!texto) return "";
    let limpio = String(texto).trim();

    if (/^```[\w-]*\s*\n[\s\S]*\n```$/m.test(limpio)) {
        limpio = limpio
            .replace(/^```[\w-]*\s*\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
    }

    return limpio;
}

function decodificarSecuenciasEscapadas(texto) {
    if (!texto) return "";
    let salida = String(texto);

    // Secuencias JSON comunes que llegan como texto literal
    salida = salida
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

    // Decodificar entidades HTML (ej: &lt;h2&gt;)
    const decoder = document.createElement('textarea');
    decoder.innerHTML = salida;
    return decoder.value;
}

function contieneHtmlRenderizable(texto) {
    if (!texto) return false;
    return /<\/?[a-z][\s\S]*>/i.test(texto);
}

function renderizarContenidoModulo(contenido) {
    const contenidoNormalizado = decodificarSecuenciasEscapadas(
        limpiarBloquesMarkdownEnvolventes(contenido || "")
    );
    if (!contenidoNormalizado) {
        return "<p class='text-xs text-gray-400'>Sin contenido generado.</p>";
    }

    if (contieneHtmlRenderizable(contenidoNormalizado)) {
        return contenidoNormalizado;
    }

    if (contieneMarkdownEstructurado(contenidoNormalizado)) {
        return convertirMarkdownBasicoAHtml(contenidoNormalizado);
    }

    const parrafos = normalizarTextoNotas(contenidoNormalizado)
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${formatearInlineMarkdown(p).replace(/\n/g, '<br>')}</p>`);

    return parrafos.join('') || "<p class='text-xs text-gray-400'>Sin contenido generado.</p>";
}

window.renderizarContenidoModulo = renderizarContenidoModulo;

function contieneMarkdownEstructurado(texto) {
    if (!texto) return false;

    return /(^|\n)\s{0,3}#{1,6}\s+/.test(texto) ||
        /(^|\n)\s{0,3}[-*+]\s+/.test(texto) ||
        /(^|\n)\s{0,3}\d+\.\s+/.test(texto) ||
        /(^|\n)\s*\|.+\|\s*(\n|$)/.test(texto) ||
        /(^|\n)\s*>\s+/.test(texto) ||
        /\*\*[^*]+\*\*/.test(texto) ||
        /`[^`]+`/.test(texto);
}

function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearInlineMarkdown(texto) {
    let resultado = escaparHtml(texto);

    // Código inline
    resultado = resultado.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-slate-800">$1</code>');

    // Enlaces http/https
    resultado = resultado.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>');

    // Negrita / cursiva
    resultado = resultado.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    resultado = resultado.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    resultado = resultado.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    resultado = resultado.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    return resultado;
}

function convertirMarkdownBasicoAHtml(markdown) {
    const lineas = normalizarTextoNotas(markdown).split('\n');
    const html = [];

    let bufferParrafo = [];
    let enListaUl = false;
    let enListaOl = false;
    let enCita = false;
    let enBloqueCodigo = false;
    let bufferCodigo = [];
    let enTabla = false;

    const cerrarParrafo = () => {
        if (!bufferParrafo.length) return;
        const contenido = formatearInlineMarkdown(bufferParrafo.join('\n')).replace(/\n/g, '<br>');
        html.push(`<p class="cb-notes-paragraph">${contenido}</p>`);
        bufferParrafo = [];
    };

    const cerrarListas = () => {
        if (enListaUl) {
            html.push('</ul>');
            enListaUl = false;
        }
        if (enListaOl) {
            html.push('</ol>');
            enListaOl = false;
        }
    };

    const cerrarCita = () => {
        if (!enCita) return;
        html.push('</blockquote>');
        enCita = false;
    };

    const cerrarBloqueCodigo = () => {
        if (!enBloqueCodigo) return;
        html.push(`<pre class="bg-slate-100 rounded-md p-3 overflow-x-auto text-xs my-2"><code>${escaparHtml(bufferCodigo.join('\n'))}</code></pre>`);
        enBloqueCodigo = false;
        bufferCodigo = [];
    };

    const parsearCeldasTabla = (lineaTabla) =>
        lineaTabla
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(celda => formatearInlineMarkdown(celda.trim()));

    const esLineaTabla = (lineaTabla) => /^\s*\|(.+)\|\s*$/.test(lineaTabla);
    const esSeparadorTabla = (lineaTabla) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lineaTabla);

    const cerrarTabla = () => {
        if (!enTabla) return;
        html.push('</tbody></table>');
        enTabla = false;
    };

    for (let i = 0; i < lineas.length; i++) {
        const lineaOriginal = lineas[i];
        const linea = lineaOriginal ?? '';
        const trim = linea.trim();

        if (enTabla && !esLineaTabla(linea)) {
            cerrarTabla();
        }

        if (/^```/.test(trim)) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            if (enBloqueCodigo) {
                cerrarBloqueCodigo();
            } else {
                enBloqueCodigo = true;
                bufferCodigo = [];
            }
            continue;
        }

        if (enBloqueCodigo) {
            bufferCodigo.push(linea);
            continue;
        }

        if (!trim) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            continue;
        }

        if (esLineaTabla(linea)) {
            const siguiente = lineas[i + 1] ?? '';
            const siguienteEsSeparador = esSeparadorTabla(siguiente);

            if (!enTabla && siguienteEsSeparador) {
                cerrarParrafo();
                cerrarListas();
                cerrarCita();

                const encabezados = parsearCeldasTabla(linea);
                html.push('<table class="w-full border-collapse text-sm my-3"><thead><tr>');
                encabezados.forEach((h) => {
                    html.push(`<th class="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">${h}</th>`);
                });
                html.push('</tr></thead><tbody>');
                enTabla = true;
                i += 1; // Saltar línea separadora |---|
                continue;
            }

            if (enTabla) {
                const celdas = parsearCeldasTabla(linea);
                html.push('<tr>');
                celdas.forEach((c) => {
                    html.push(`<td class="border border-slate-300 px-2 py-1 align-top">${c}</td>`);
                });
                html.push('</tr>');
                continue;
            }
        }

        const encabezado = linea.match(/^\s*(#{1,6})\s+(.+)$/);
        if (encabezado) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            const nivel = encabezado[1].length;
            const contenido = formatearInlineMarkdown(encabezado[2].trim());
            html.push(`<h${nivel} class="font-semibold text-slate-900 mt-3 mb-2">${contenido}</h${nivel}>`);
            continue;
        }

        const itemUl = linea.match(/^\s*[-*+]\s+(.+)$/);
        if (itemUl) {
            cerrarParrafo();
            cerrarCita();
            cerrarTabla();
            if (enListaOl) {
                html.push('</ol>');
                enListaOl = false;
            }
            if (!enListaUl) {
                html.push('<ul class="list-disc pl-6 my-2 space-y-1">');
                enListaUl = true;
            }
            html.push(`<li>${formatearInlineMarkdown(itemUl[1].trim())}</li>`);
            continue;
        }

        const itemOl = linea.match(/^\s*\d+\.\s+(.+)$/);
        if (itemOl) {
            cerrarParrafo();
            cerrarCita();
            cerrarTabla();
            if (enListaUl) {
                html.push('</ul>');
                enListaUl = false;
            }
            if (!enListaOl) {
                html.push('<ol class="list-decimal pl-6 my-2 space-y-1">');
                enListaOl = true;
            }
            html.push(`<li>${formatearInlineMarkdown(itemOl[1].trim())}</li>`);
            continue;
        }

        const cita = linea.match(/^\s*>\s?(.*)$/);
        if (cita) {
            cerrarParrafo();
            cerrarListas();
            cerrarTabla();
            if (!enCita) {
                html.push('<blockquote class="border-l-4 border-slate-300 pl-3 italic text-slate-700 my-2">');
                enCita = true;
            }
            const contenidoCita = cita[1].trim();
            if (contenidoCita) {
                html.push(`<p class="mb-2 last:mb-0">${formatearInlineMarkdown(contenidoCita)}</p>`);
            }
            continue;
        }

        cerrarListas();
        cerrarCita();
        bufferParrafo.push(linea);
    }

    cerrarParrafo();
    cerrarListas();
    cerrarCita();
    cerrarTabla();
    cerrarBloqueCodigo();

    return html.join('');
}

function renderizarContenidoNotasMaestro(notasTexto) {
    const textoNormalizado = normalizarTextoNotas(notasTexto);
    if (!textoNormalizado) return '<p class="cb-notes-paragraph">No se pudieron generar las notas.</p>';

    if (contieneMarkdownEstructurado(textoNormalizado)) {
        return convertirMarkdownBasicoAHtml(textoNormalizado);
    }

    return formatearParrafos(limpiarYFormatearTexto(textoNormalizado));
}

function detectarModoNotasMaestro({ tipoModulo, contenidoHTML, contenidoLimpio }) {
  const tipoNormalizado = normalizarTipoModulo(tipoModulo);

  const preguntasDetectadas =
    (contenidoHTML.match(/PREGUNTA\s*\d+/gi) || []).length;

  switch (tipoNormalizado) {
    case "quiz":
      return {
        modo: "quiz",
        preguntasDetectadas
      };

    case "leccion":
      return {
        modo: "leccion",
        preguntasDetectadas
      };

    case "notas_maestro":
      return {
        modo: "actividad_guiada",
        preguntasDetectadas: 0
      };

    case "pagina":
    case "libro":
      return {
        modo: "contenido",
        preguntasDetectadas: 0
      };

    default:
      return {
        modo: "contenido",
        preguntasDetectadas: 0
      };
  }
}


function formatearParrafos(texto) {
    const parrafos = texto.split('\n\n').filter(p => p.trim().length > 0);
    
    return parrafos.map((parrafo, index) => {
        const tieneNumero = REGEX_ORDINALES.test(parrafo.toLowerCase());
        
        let clases = "cb-notes-paragraph";
        
        if (index === 0) {
            clases += " cb-notes-paragraph-intro";
        } else if (tieneNumero) {
            clases += " cb-notes-paragraph-question";
        }
        
        // Resaltar números de preguntas
        let contenido = parrafo.replace(
            /\b(primera|segunda|tercera|cuarta|quinta|sexta)\b (\w+)/gi, 
            '<strong class="cb-notes-ordinal-highlight">$1 $2</strong>'
        );
        
        return `<p class="${clases}">${contenido}</p>`;
    }).join('');
}

// Función para guardar las notas generadas
window.guardarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) {
        alert("No hay módulo seleccionado");
        return;
    }
    
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    
    if (!contenidoModal || contenidoModal.innerHTML.includes("Error")) {
        alert("No hay notas válidas para guardar");
        return;
    }
    
    try {
        // Cambiar estado de los botones
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = true;
        
        // Obtener el módulo
        const modulo = await obtenerModulo(moduloNotasMaestroId);
        
        // Guardar las notas en el módulo
        await guardarModulo(moduloNotasMaestroId, {
            notasMaestro: contenidoModal.innerHTML,
            notasMaestroGenerado: new Date().toISOString()
        });
        
        // Restaurar botones
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Actualizar Notas';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
        
        // Mostrar notificación
        mostrarNotificacion("✅ Notas para el maestro guardadas correctamente", 'success');
        
        // Actualizar la vista para mostrar que están guardadas
        const fecha = new Date().toLocaleString();
        const fechaDiv = document.createElement('div');
        fechaDiv.className = "text-xs text-green-600 mt-4 text-center";
        fechaDiv.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Guardado: ${fecha}`;
        contenidoModal.appendChild(fechaDiv);
        
    } catch (error) {
        
        // Restaurar botones
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
        
        mostrarNotificacion(`❌ Error al guardar: ${error.message}`, 'error');
    }
};

window.aplicarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) {
        alert("No hay módulo seleccionado");
        return;
    }

    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    if (!contenidoModal || !btnAplicarNotas) return;

    if (contenidoModal.innerHTML.includes("Error")) {
        alert("No hay notas válidas para aplicar");
        return;
    }

    const bloqueNotas = contenidoModal.querySelector(".notas-maestro-simple");
    const htmlAplicable = (bloqueNotas ? bloqueNotas.outerHTML : contenidoModal.innerHTML).trim();
    if (!htmlAplicable) {
        alert("No hay contenido generado para aplicar");
        return;
    }

    try {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Aplicando...';

        const contModulo = document.getElementById(`contenido-${moduloNotasMaestroId}`);
        if (contModulo) {
            contModulo.innerHTML = htmlAplicable;
        }

        await guardarModulo(moduloNotasMaestroId, { contenido: htmlAplicable });

        mostrarNotificacion("✅ Contenido aplicado al módulo correctamente", "success");
    } catch (error) {
        mostrarNotificacion(`❌ Error al aplicar contenido: ${error.message}`, "error");
    } finally {
        btnAplicarNotas.disabled = false;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
};

// Función para cerrar el modal
window.cerrarModalNotasMaestro = function() {
    const modal = document.getElementById("modalNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Resetear estado
    moduloNotasMaestroId = null;
    
    // Limpiar contenido
    document.getElementById("contenidoNotasMaestro").innerHTML = "";
    
    // Resetear botones
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
    }
    
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.add("hidden");
        btnRegenerarNotas.disabled = false;
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
    
    // Ocultar modal
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};


async function eliminarModulo(moduloId) {
    const sub = subtemaActivo;

    // Eliminar del array local (usando solo el ID interno si es necesario)
    const idInterno = moduloId.includes('_') ? moduloId.split('_')[1] : moduloId;
    sub.modulosIds = sub.modulosIds.filter(id => {
        // Comparar IDs: si el ID en el array contiene guión bajo, comparar completo
        // si no, comparar solo la parte después del guión bajo
        if (id.includes('_')) {
            return id !== moduloId;
        } else {
            return id !== idInterno;
        }
    });
    
    await guardarCursoFirebase();

    // IMPORTANTE: Borrar con ID compuesto
    const idParaBorrar = moduloId.includes('_') ? moduloId : `${curso.id}_${moduloId}`;
    await deleteDoc(doc(db, "moodleCourses", idParaBorrar));

    cargarSubtema(sub);
}

window.eliminarModulo = eliminarModulo;



// Al inicio de tu archivo, después de las variables globales
document.addEventListener('DOMContentLoaded', async () => {
    // Restaurar estado del curso seleccionado
    const cursoId = localStorage.getItem("cursoSeleccionado");
    if (cursoId) {
        // Esperar a que el usuario esté autenticado
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                await cargarCursosUsuario();
                
                // Verificar que el curso aún existe
                const cursoExiste = cursosUsuario.some(c => c.id === cursoId);
                if (cursoExiste) {
                    // Pequeño delay para asegurar que todo esté cargado
                    setTimeout(() => {
                        seleccionarCurso(cursoId);
                    }, 500);
                }
            }
        });
    }
});






/* SELECTOR PARA AÑADIR NUEVO MÓDULO */
/* ======================================================
   MODAL SIMPLE: Seleccionar tipo de módulo
====================================================== */

function construirContenidoInicialModulo(tipo) {
    if (normalizarTipoModulo(tipo) !== "notas_maestro") return "";

    return `
<h3>Ejercicio guiado: Aplicación del contenido</h3>
<p><strong>Objetivo de la actividad:</strong> Aplicar los conceptos del módulo en una situación práctica.</p>
<p><strong>Instrucciones para el estudiante:</strong></p>
<ol>
  <li>Lee con atención la consigna y subraya la información clave.</li>
  <li>Resuelve el ejercicio justificando cada paso de tu respuesta.</li>
  <li>Compara tu solución con un compañero y mejora tu propuesta.</li>
  <li>Presenta la versión final explicando qué aprendiste.</li>
</ol>
<p><strong>Criterio de logro:</strong> Explica el procedimiento con claridad y sustenta su respuesta.</p>
`.trim();
}

function construirInstruccionesInicialesModulo(tipo) {
    if (normalizarTipoModulo(tipo) !== "notas_maestro") return "";

    return `
1. Presente el objetivo del ejercicio y el tiempo total estimado.
2. Modele un ejemplo breve antes de iniciar el trabajo autónomo.
3. Monitoree el avance con preguntas de apoyo y retroalimentación puntual.
4. Cierre con socialización de respuestas y criterios de evaluación.
`.trim();
}

function mostrarSelectorModulo(subtema) {
    const tipos = [
        "Quizz",
        "Página",
        "Archivo",
        "Libro",
        "Lección",
        "Tarea",
        "URL",
        "Archivo adjunto",
        "Notas del Maestro",
    ];

    const modal = document.getElementById("modalSelectorModulo");
    const lista = document.getElementById("listaOpcionesModulo");
    const btnCancelar = document.getElementById("btnCancelarSelectorModulo");

    // Limpiar lista
    lista.innerHTML = "";

    // Crear botones
    tipos.forEach(tipo => {
        const btn = document.createElement("button");
        btn.className = "w-full text-left px-3 py-2 border border-border rounded-md hover:bg-accent text-sm text-foreground bg-background";
        btn.textContent = tipo;

        btn.addEventListener("click", async () => {
            const nuevoModuloId = crypto.randomUUID();

            const nuevoModulo = {
                id: nuevoModuloId,
                cursoId: curso.id,
                subtemaId: subtema.id,
                tipo,
                nombre: tipo,
                contenido: construirContenidoInicialModulo(tipo),
                instrucciones: construirInstruccionesInicialesModulo(tipo),
                traducciones: [],
                creado: Date.now(),
                actualizado: Date.now()
            };

            // 📌 GUARDAR MÓDULO CON ID COMPUESTO
            await setDoc(doc(db, "moodleCourses", `${curso.id}_${nuevoModuloId}`), nuevoModulo);

            // 📌 GUARDAR SOLO EL ID INTERNO EN EL SUBTEMA
            if (!subtema.modulosIds) subtema.modulosIds = [];
            subtema.modulosIds.push(nuevoModuloId);  // Solo el ID interno

            await guardarCursoFirebase();
            renderTemas();
            setTimeout(() => cargarSubtema(subtema), 100);
            modal.classList.add("hidden");
        });



        lista.appendChild(btn);
    });

    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // CANCELAR
    btnCancelar.onclick = () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    };
}



async function duplicarSubtema(tema, subtemaOriginal) {
    // 1. Crear copia profunda del subtema
    const nuevoSubtema = JSON.parse(JSON.stringify(subtemaOriginal));

    // 2. Asignar nuevo ID
    nuevoSubtema.id = crypto.randomUUID();
    nuevoSubtema.nombre = subtemaOriginal.nombre + " (copia)";

    // 3. Regenerar IDs de módulos dentro del subtema
    nuevoSubtema.modulos = nuevoSubtema.modulos.map(mod => ({
        ...mod,
        id: crypto.randomUUID()
    }));

    // 4. Insertar la copia justo después del original
    const index = tema.subtemas.indexOf(subtemaOriginal);
    tema.subtemas.splice(index + 1, 0, nuevoSubtema);

    // 5. Guardar y recargar
    await guardarCursoFirebase();
    renderTemas();

    // 6. Abrir el subtema duplicado automáticamente
    setTimeout(() => {
        cargarSubtema(nuevoSubtema);
    }, 200);
}



export async function obtenerModulo(moduloId, cursoIdEspecifico = null) {
    // Determinar cursoId
    let cursoIdParaBuscar = cursoIdEspecifico || (curso ? curso.id : null);
    
    if (!cursoIdParaBuscar) {
        return null;
    }
    
    const idParaBuscar = construirDocIdModulo(moduloId, cursoIdParaBuscar);
    if (!idParaBuscar) return null;

    const cached = modulosCache.get(idParaBuscar);
    if (cached) {
        return cached;
    }
    
    
    const docRef = doc(db, "moodleCourses", idParaBuscar);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const data = snap.data();
        
        // Asegurar que el ID interno esté presente
        if (!data.id) {
            // Extraer ID interno del formato compuesto
            data.id = idParaBuscar.includes('_') ? idParaBuscar.split('_')[1] : idParaBuscar;
        }
        
        modulosCache.set(idParaBuscar, data);
        return data;
    } else {
        
        // Intentar con el ID original (por compatibilidad)
        if (moduloId !== idParaBuscar) {
            const docRefOriginal = doc(db, "moodleCourses", moduloId);
            const snapOriginal = await getDoc(docRefOriginal);
            
            if (snapOriginal.exists()) {
                const data = snapOriginal.data();
                if (!data.id) data.id = moduloId;
                modulosCache.set(idParaBuscar, data);
                return data;
            }
        }
        
        return null;
    }
}


// Función auxiliar para normalizar IDs
function normalizarIdModulo(moduloId, paraFirestore = false) {
    if (!moduloId) return null;
    
    // Si ya tiene el formato correcto
    if (moduloId.includes('_')) {
        return moduloId;
    }
    
    // Si no, construir el formato
    if (curso && curso.id) {
        if (paraFirestore) {
            // Para Firestore: curso.id_moduloId
            return `${curso.id}_${moduloId}`;
        } else {
            // Para arrays: solo el ID interno
            return moduloId;
        }
    }
    
    return moduloId;
}

function esErrorTamanoFirestore(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("exceeds the maximum allowed size")
        || msg.includes("cannot be written because its size")
        || msg.includes("maximum allowed size");
}

function limpiarDataUrlsPesadas(texto = "") {
    return String(texto || "")
        // Remover imágenes base64 embebidas en tags <img>.
        .replace(/<img[^>]+src=["']data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+["'][^>]*>/gi, "[Imagen embebida removida por límite de tamaño]")
        // Remover data URLs sueltas.
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "[data:image removida]")
        .trim();
}

function recortarTextoSeguro(texto = "", maxChars = 240000) {
    const limpio = limpiarDataUrlsPesadas(texto);
    if (limpio.length <= maxChars) return limpio;
    return `${limpio.slice(0, maxChars)}\n\n[Contenido recortado automáticamente por límite de tamaño del documento]`;
}

function sanitizarTraducciones(traducciones) {
    if (!Array.isArray(traducciones)) return [];
    return traducciones.slice(0, 12).map((t) => ({
        ...t,
        contenido: recortarTextoSeguro(t?.contenido || "", 120000)
    }));
}

function quitarUndefinedPlano(obj = {}) {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (v !== undefined) out[k] = v;
    });
    return out;
}

async function reintentarGuardadoModuloReduciendoTamano({
    docRef,
    snap,
    moduloId,
    cursoIdParaGuardar,
    cambios
}) {
    const actual = snap?.exists() ? (snap.data() || {}) : {};
    const cambiosBase = { ...(cambios || {}) };

    if (Object.prototype.hasOwnProperty.call(cambiosBase, "instrucciones")) {
        cambiosBase.instrucciones = recortarTextoSeguro(cambiosBase.instrucciones, 160000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "contenido")) {
        cambiosBase.contenido = recortarTextoSeguro(cambiosBase.contenido, 280000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "notasMaestro")) {
        cambiosBase.notasMaestro = recortarTextoSeguro(cambiosBase.notasMaestro, 180000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "contenidoGenerado")) {
        cambiosBase.contenidoGenerado = recortarTextoSeguro(cambiosBase.contenidoGenerado, 180000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "traducciones")) {
        cambiosBase.traducciones = sanitizarTraducciones(cambiosBase.traducciones);
    }

    const payloadRescate = quitarUndefinedPlano({
        ...cambiosBase,
        instrucciones: recortarTextoSeguro(
            cambiosBase.instrucciones ?? actual.instrucciones ?? "",
            160000
        ),
        contenido: recortarTextoSeguro(
            cambiosBase.contenido ?? actual.contenido ?? "",
            280000
        ),
        notasMaestro: recortarTextoSeguro(
            cambiosBase.notasMaestro ?? actual.notasMaestro ?? "",
            180000
        ),
        contenidoGenerado: recortarTextoSeguro(
            cambiosBase.contenidoGenerado ?? actual.contenidoGenerado ?? "",
            180000
        ),
        traducciones: sanitizarTraducciones(
            cambiosBase.traducciones ?? actual.traducciones ?? []
        ),
        actualizado: Date.now(),
        cursoId: cursoIdParaGuardar,
        ultimaModificacion: new Date().toISOString(),
        modificadoPor: currentUserId,
        id: moduloId.includes('_') ? moduloId.split('_')[1] : moduloId
    });

    if (snap.exists()) {
        await updateDoc(docRef, payloadRescate);
    } else {
        await setDoc(docRef, {
            creado: Date.now(),
            ...payloadRescate
        });
    }

    return payloadRescate;
}


export async function guardarModulo(moduloId, cambios, cursoIdEspecifico = null) {
    try {
        // Determinar qué cursoId usar
        let cursoIdParaGuardar = cursoIdEspecifico || (curso ? curso.id : null);
        
        if (!cursoIdParaGuardar) {
            throw new Error("No hay cursoId especificado");
        }
        
        // Crear el ID del documento
        const docId = construirDocIdModulo(moduloId, cursoIdParaGuardar);
        if (!docId) throw new Error("No se pudo construir docId del módulo");
        const docRef = doc(db, "moodleCourses", docId);
        
        // Primero verificar si existe
        const snap = await getDoc(docRef);
        
        const datosActualizados = {
            ...cambios,
            actualizado: Date.now(),
            cursoId: cursoIdParaGuardar,
            // 🔥 Añadir timestamp para sincronización
            ultimaModificacion: new Date().toISOString(),
            // 🔥 Añadir ID del usuario que modificó
            modificadoPor: currentUserId
        };
        
        // Si no tiene ID en los datos, agregarlo
        if (!datosActualizados.id) {
            datosActualizados.id = moduloId.includes('_') ? moduloId.split('_')[1] : moduloId;
        }
        
        if (snap.exists()) {
            await updateDoc(docRef, datosActualizados);
            modulosCache.set(docId, {
                ...snap.data(),
                ...datosActualizados
            });
        } else {
            // Si no existe, crear con datos básicos
            const dataNuevo = {
                id: moduloId.includes('_') ? moduloId.split('_')[1] : moduloId,
                cursoId: cursoIdParaGuardar,
                creado: Date.now(),
                ...datosActualizados
            };
            await setDoc(docRef, dataNuevo);
            modulosCache.set(docId, dataNuevo);
        }
        
        return true;
    } catch (error) {
        if (esErrorTamanoFirestore(error)) {
            const docId = construirDocIdModulo(moduloId, cursoIdEspecifico || (curso ? curso.id : null));
            const cursoIdParaGuardar = cursoIdEspecifico || (curso ? curso.id : null);
            if (!docId || !cursoIdParaGuardar) throw error;

            const docRef = doc(db, "moodleCourses", docId);
            const snap = await getDoc(docRef);

            const payloadRescate = await reintentarGuardadoModuloReduciendoTamano({
                docRef,
                snap,
                moduloId,
                cursoIdParaGuardar,
                cambios
            });

            modulosCache.set(docId, {
                ...(snap.exists() ? snap.data() : {}),
                ...payloadRescate
            });
            return true;
        }
        throw error;
    }
}


window.editarModulo = async function (moduloId) {
    const sub = subtemaActivo;
    const modulo = await obtenerModulo(moduloId);

    // Crear modal para editar contenido del módulo
    const modalHTML = `
        <div id="modalEditContenidoModulo" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
            <div class="bg-white rounded-lg p-6 w-full max-w-2xl cb-modal-scroll-80">
                <h3 class="text-lg font-semibold mb-4">Editar contenido del módulo: ${modulo.nombre}</h3>
                <textarea 
                    id="inputEditContenidoModulo" 
                    placeholder="Contenido HTML del módulo"
                    class="w-full p-3 border border-gray-300 rounded mb-4 font-mono text-sm"
                    rows="15"
                >${modulo.contenido || ""}</textarea>
                <div class="flex justify-end gap-2">
                    <button 
                        id="btnCancelarEditContenidoModulo"
                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancelar
                    </button>
                    <button 
                        id="btnConfirmarEditContenidoModulo"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById("modalEditContenidoModulo");
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById("modalEditContenidoModulo");
    const textarea = document.getElementById("inputEditContenidoModulo");
    const btnCancelar = document.getElementById("btnCancelarEditContenidoModulo");
    const btnConfirmar = document.getElementById("btnConfirmarEditContenidoModulo");
    
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    setTimeout(() => textarea.focus(), 100);
    
    const nuevoContenido = await new Promise((resolve) => {
        const limpiar = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };
        
        btnConfirmar.onclick = () => {
            const valor = textarea.value;
            limpiar();
            modal.classList.add("hidden");
            resolve(valor);
        };
        
        btnCancelar.onclick = () => {
            limpiar();
            modal.classList.add("hidden");
            resolve(null);
        };
        
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') btnCancelar.click();
        };
    });
    
    setTimeout(() => modal.remove(), 300);
    
    if (nuevoContenido === null) return; // cancelar

    await guardarModulo(moduloId, { contenido: nuevoContenido });
    cargarSubtema(subtemaActivo);
};


let ultimoAnalisis = 0;

function puedeAnalizar() {
    const ahora = Date.now();
    if (ahora - ultimoAnalisis < 5000) {
        return false; // 5 segundos
    }
    ultimoAnalisis = ahora;
    return true;
}


window.analizarModulo = async function (moduloId) {
    
    if (!puedeAnalizar()) {
        mostrarModalAnalisis(`
            <div class="p-4 text-yellow-700 bg-yellow-100 border border-yellow-300 rounded">
                Estás solicitando análisis demasiado rápido.  
                Espera 5 segundos antes de volver a analizar.
            </div>
        `);
        return;
    }

    const sub = subtemaActivo;
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) return;

    mostrarModalAnalisis(`
        <div class="flex items-center gap-2 text-blue-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i>
            Analizando coherencia del módulo...
        </div>
    `);

    try {
        const endpoint = getGeminiEndpoint();

const prompt = `
Eres un experto en análisis pedagógico, lingüístico y didáctico.
anliza el módulo en busca de contenido falso, incoherente o contradictorio.
 -Evalúa la coherencia del módulo.  
 -Verificar datos incorrectos
 -Detectar afirmaciones dudosas
 -Señalar números no sustentados
 -Proponer correcciones
 -Marcar incoherencias

⚠ INSTRUCCIONES IMPORTANTES:
- NO devuelvas JSON  
- NO devuelvas markdown  
- NO uses código ni bloques con \`\`\`html
- NO uses comillas " "  
- NO uses llaves {}  
- NO uses formato de objeto  
- NO devuelvas text/json ni nada similar  

✔ Devuelve SOLO **HTML puro**, exactamente con esta estructura:

<div class="analisis-contenedor">

  <h3 class="analisis-title">Sinopsis del contenido</h3>
  <div class="sinopsis">
    Resumen breve del contenido
  </div>

  <h3 class="analisis-title">Resultado del análisis</h3>
  <div class="estado">[COHERENTE]</div>

  <div class="justificacion">
    Texto explicando por qué es coherente o incoherente.
  </div>

<h3 class="analisis-title">Oportunidades de mejora</h3>

  <div class="oportunidades-mejora">
    Oportunidades para mejorar el contenido.
  </div>

</div>


CONTENIDO A ANALIZAR:
##########################################
${modulo.contenido || "(Vacío)"}
##########################################
`;


        const body = {
            contents: [
                { parts: [ { text: prompt } ] }
            ]
        };

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";

        mostrarModalAnalisis(txt);

    } catch (err) {
        mostrarModalAnalisis(`
            <div class="text-red-600">Error al analizar el módulo</div>
            <pre>${err}</pre>
        `);
    }
};



window.mostrarModalAnalisis = function (html) {
    const modal = document.getElementById("modalAnalisisModulo");
    const cont = document.getElementById("contenidoAnalisisModulo");

    cont.innerHTML = html;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}



window.cerrarModalAnalisis = function () {
    const modal = document.getElementById("modalAnalisisModulo");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}


window.traducirContenidoSubtema = async function (subtema, idioma) {

    const contPrev = document.getElementById("contenidoTraduccionSubtema");

    if (!subtema.contenidoGenerado || subtema.contenidoGenerado.trim() === "") {
        contPrev.innerHTML = `<p class="text-red-500 text-sm">No hay contenido generado para traducir.</p>`;
        return;
    }

    contPrev.innerHTML = `
        <div class="flex items-center gap-2 text-teal-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i>
            Traduciendo contenido al idioma ${idioma}...
        </div>
    `;

    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
Traduce el siguiente contenido HTML al idioma ${idioma}.
- Mantener formato HTML exacto.
- NO inventar contenido nuevo.
- Solo traducir texto visible.

###########################################
${subtema.contenidoGenerado}
###########################################
        `;

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await res.json();
        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";

        texto = texto.replace(/```html/gi, "").replace(/```/g, "");

        // =============================
        // ✔ GUARDAR EN EL SUBTEMA
        // =============================
        if (!subtema.traducciones) subtema.traducciones = [];

        subtema.traducciones.push({
            id: crypto.randomUUID(),
            idioma,
            contenido: texto
        });

        await guardarCursoFirebase();

        // =============================
        // ✔ MOSTRAR EN EL MODAL
        // =============================
        contPrev.innerHTML = texto;

        // activar menú contextual
        setTimeout(() => activarAccionesEnParrafos(), 50);
        

    } catch (err) {
        contPrev.innerHTML = `
            <div class="text-red-600">Error al traducir</div>
            <pre class="text-xs">${err}</pre>
        `;
    }
};

window.cerrarModalTraducirSubtema = function () {
    const modal = document.getElementById("modalTraducirSubtema");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

function inicializarModalTraduccionSubtema() {
    const modal = document.getElementById("modalTraducirSubtema");
    const btnAceptar = document.getElementById("btnAceptarTraduccionSubtema");
    const selectIdioma = document.getElementById("selectIdiomaSubtema");

    if (!modal || !btnAceptar || !selectIdioma) return;
    if (modal.dataset.bindTradSubtema === "1") return;
    modal.dataset.bindTradSubtema = "1";

    btnAceptar.addEventListener("click", async () => {
        const subtema = window.__subtemaTraduciendo;
        const idioma = selectIdioma.value;

        if (!subtema) {
            alert("No hay subtema seleccionado.");
            return;
        }
        if (!idioma) {
            alert("Selecciona un idioma.");
            return;
        }

        await window.traducirContenidoSubtema(subtema, idioma);
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            window.cerrarModalTraducirSubtema();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) {
            window.cerrarModalTraducirSubtema();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarModalTraduccionSubtema);
} else {
    inicializarModalTraduccionSubtema();
}

window.renderListadoTraduccionesSubtema = function (subtema) {
    const cont = document.getElementById("listaTraduccionesSubtema");

    if (!cont) return;

    if (!subtema.traducciones || subtema.traducciones.length === 0) {
        cont.innerHTML = `<p class="text-muted-foreground text-sm">No hay traducciones registradas.</p>`;
        return;
    }

    cont.innerHTML = subtema.traducciones.map(t => `
        <div class="p-3 border border-border rounded mb-2 flex justify-between items-center">
            <p class="font-semibold text-sm text-foreground">${t.idioma}</p>

            <div class="flex gap-3 text-sm">
                <span class="text-primary cursor-pointer"
                    onclick="abrirTraduccionSubtema('${t.id}')">Ver</span>

                <span class="text-destructive cursor-pointer"
                    onclick="eliminarTraduccionSubtema('${t.id}')">Eliminar</span>
            </div>
        </div>
    `).join("");
};




window.traducirModulo = async function(moduloId) {
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) return;

    // ✅ GUARDAR ESTE MÓDULO COMO ACTIVO EN localStorage
    localStorage.setItem("moduloActivo", moduloId);
    
    // Establecer el módulo en traducción
    window.__moduloTraduciendo = modulo;
    
    // Mostrar el modal de traducción
    const modal = document.getElementById("modalTraduccionModulo");
    const select = document.getElementById("selectIdiomaTraduccion");
    const cont = document.getElementById("contenidoTraduccionModulo");
    
    // Resetear el modal
    select.value = "";
    cont.innerHTML = `<p class="text-gray-400 text-sm">Aquí aparecerá la traducción del módulo.</p>`;
    
    // Cargar traducciones existentes
    if (modulo.traducciones && modulo.traducciones.length > 0) {
        renderListadoTraducciones(modulo);
    } else {
        const listaCont = document.getElementById("listaTraduccionesExistentes");
        if (listaCont) {
            listaCont.innerHTML = `<p class="text-gray-400 text-sm">No hay traducciones aún.</p>`;
        }
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};




document.getElementById("btnGenerarTraduccion").onclick = async function () {
    const idioma = document.getElementById("selectIdiomaTraduccion").value;
    if (!idioma) {
        alert("Selecciona un idioma.");
        return;
    }

    // ✅ USAR window.__moduloTraduciendo en lugar de buscar en localStorage
    const modulo = window.__moduloTraduciendo;
    
    if (!modulo) {
        alert("No hay módulo seleccionado para traducir.");
        return;
    }

    document.getElementById("contenidoTraduccionModulo").innerHTML = `
        <div class="flex items-center gap-2 text-teal-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i> Generando traducción...
        </div>
    `;

    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
Traduce el siguiente contenido al idioma ${idioma}.
Reglas:
- Traducción natural, NO literal.
- Mantener formato HTML.
- NO inventes contenido nuevo.

Contenido:
#############################################
${modulo.contenido || "(Vacío)"}
#############################################
        `;

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await res.json();
        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";

        // LIMPIAR ```html ``` Y ``` CUALQUIER BLOQUE
        texto = texto.replace(/```html/gi, "");
        texto = texto.replace(/```/g, "");

        // guardar traducción en Firestore (documento del módulo)
        const nueva = {
            id: crypto.randomUUID(),
            idioma,
            contenido: texto
        };

        const nuevasTraducciones = Array.isArray(modulo.traducciones)
            ? [...modulo.traducciones, nueva]
            : [nueva];

        await guardarModulo(modulo.id, { traducciones: nuevasTraducciones });

        // refrescar objeto local
        modulo.traducciones = nuevasTraducciones;

        // actualizar modal
        renderListadoTraducciones(modulo);

        // mostrar traducción
        document.getElementById("contenidoTraduccionModulo").innerHTML = texto;

    } catch (err) {
        document.getElementById("contenidoTraduccionModulo").innerHTML = `
            <div class="text-red-600">Error al traducir</div>
            <pre>${err.message}</pre>
        `;
    }
};

window.abrirTraduccionSubtema = function (idTraduccion) {
    const subtema = window.subtemaActivo;
    if (!subtema || !subtema.traducciones) return;

    const t = subtema.traducciones.find(x => x.id === idTraduccion);
    if (!t) return;

    const cont = document.getElementById("contenidoTraduccionSubtema");
    if (!cont) return;

    cont.innerHTML = t.contenido;
    cont.dataset.traduccionId = idTraduccion;


    // Activar edición de párrafos
    setTimeout(() => activarAccionesEnParrafos(), 50);

    // Efecto visual
    cont.classList.add("highlight-pulse");
    setTimeout(() => cont.classList.remove("highlight-pulse"), 1500);
};



window.eliminarTraduccionSubtema = async function (idTraduccion) {
    const subtema = window.subtemaActivo;
    if (!subtema || !subtema.traducciones) return;

    // Confirmación
    if (!confirm("¿Eliminar esta traducción?")) return;

    // Eliminar del array
    subtema.traducciones = subtema.traducciones.filter(t => t.id !== idTraduccion);

    // Guardar en Firebase
    if (typeof guardarCursoFirebase === "function") {
        await guardarCursoFirebase();
    }

    // Refrescar listado
    if (typeof renderListadoTraduccionesSubtema === "function") {
        renderListadoTraduccionesSubtema(subtema);
    }

    // Limpiar vista previa si estabas viendo esa traducción
    const cont = document.getElementById("contenidoTraduccionSubtema");
    if (cont) cont.innerHTML = `<p class="text-gray-400 text-sm">Selección eliminada.</p>`;
};


// Asegúrate de que esta función esté definida GLOBALMENTE, no dentro de otro scope
window.renderListadoTraducciones = function(modulo) {
    const cont = document.getElementById("listaTraduccionesExistentes");
    
    if (!cont) {
        return;
    }
    
    if (!modulo.traducciones || modulo.traducciones.length === 0) {
        cont.innerHTML = `<p class="text-gray-400 text-sm">No hay traducciones aún.</p>`;
        return;
    }

    const html = modulo.traducciones.map(t => `
        <div class="p-3 border rounded mb-2 flex justify-between items-center bg-gray-50">
            <div>
                <p class="font-semibold text-sm">${t.idioma}</p>
                <p class="text-xs text-gray-500 truncate cb-max-w-200">
                    ${t.contenido.substring(0, 50)}${t.contenido.length > 50 ? '...' : ''}
                </p>
            </div>
            <div class="flex gap-3 text-sm">
                <span class="text-blue-600 cursor-pointer hover:text-blue-800"
                    onclick="window.abrirTraduccion('${t.id}', '${modulo.id}')">Ver</span>
                <span class="text-red-600 cursor-pointer hover:text-red-800"
                    onclick="window.eliminarTraduccion('${t.id}', '${modulo.id}')">Eliminar</span>
            </div>
        </div>
    `).join("");

    cont.innerHTML = html;
};


window.abrirTraduccion = async function (idTraduccion, moduloId = null) {
    let modulo = window.__moduloTraduciendo;
    
    // Si no tenemos el módulo en memoria o se especifica un ID diferente
    if (!modulo || (moduloId && modulo.id !== moduloId)) {
        if (moduloId) {
            modulo = await obtenerModulo(moduloId);
        } else {
            // Buscar entre todos los módulos del subtema activo
            const sub = subtemaActivo;
            if (!sub || !sub.modulosIds) return;

            for (const modId of sub.modulosIds) {
                const m = await obtenerModulo(modId);
                if (m && m.traducciones) {
                    const t = m.traducciones.find(tr => tr.id === idTraduccion);
                    if (t) {
                        modulo = m;
                        break;
                    }
                }
            }
        }
    }

    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    const traduccion = modulo.traducciones.find(t => t.id === idTraduccion);
    if (!traduccion) {
        alert("No se encontró la traducción.");
        return;
    }

    // Insertar contenido en el modal
    const cont = document.getElementById("contenidoTraduccionModulo");
    if (cont) {
        cont.innerHTML = traduccion.contenido;
        cont.dataset.traduccionId = idTraduccion;
        cont.dataset.moduloId = modulo.id;
    }

    // Activar menú contextual
    setTimeout(() => activarAccionesEnParrafos(), 50);
};


window.eliminarTraduccion = async function (idTraduccion, moduloId = null) {
    let modulo = moduloId ? await obtenerModulo(moduloId) : window.__moduloTraduciendo;
    
    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    if (!confirm("¿Eliminar esta traducción?")) return;

    // Eliminar la traducción del array
    modulo.traducciones = modulo.traducciones.filter(t => t.id !== idTraduccion);

    // Guardar en Firebase
    await guardarModulo(modulo.id, { traducciones: modulo.traducciones });

    // Refrescar listado
    window.renderListadoTraducciones(modulo);

    // Limpiar contenido de vista previa si es la traducción que se está viendo
    const cont = document.getElementById("contenidoTraduccionModulo");
    if (cont && cont.dataset.traduccionId === idTraduccion) {
        cont.innerHTML = `<p class="text-gray-400 text-sm">Traducción eliminada.</p>`;
    }
};



window.mostrarModalTraduccion = function (html) {
    const modal = document.getElementById("modalTraduccionModulo");
    const cont = document.getElementById("contenidoTraduccionModulo");

    cont.innerHTML = html;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

window.cerrarModalTraduccion = function () {
    const modal = document.getElementById("modalTraduccionModulo");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

// Asegúrate de que este código se ejecute al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    const btnCancelarTraduccion = document.getElementById("btnCancelarTraduccion");
    if (btnCancelarTraduccion) {
        btnCancelarTraduccion.onclick = function() {
            document.getElementById("modalTraduccionModulo").classList.add("hidden");
        };
    }
});
// Variable global para almacenar el ID del módulo actual y el contenido generado
// Variable global para almacenar el ID del módulo actual y el contenido generado
let moduloTonoActual = null;
let contenidoGeneradoTono = null;

// Definir las descripciones de cada tono - VERSIÓN COMPLETA
const descripcionesTono = {
    // Estilo Formal
    academico: {
        titulo: "ACADÉMICO",
        descripcion: "Formal, riguroso, preciso. Usa terminología especializada, referencias académicas y estructura lógica. Ideal para textos universitarios o científicos."
    },
    cientifico: {
        titulo: "CIENTÍFICO",
        descripcion: "Objetivo, preciso, basado en evidencia. Usa terminología técnica, datos verificables y metodología clara. Formato impersonal y neutral."
    },
    
    // Estilo Informativo
    periodistico: {
        titulo: "PERIODÍSTICO",
        descripcion: "Claro, directo, objetivo. Presenta hechos de manera neutral, responde a las preguntas básicas (qué, quién, cuándo, dónde, por qué). Estructura de pirámide invertida."
    },
    informativo: {
        titulo: "INFORMATIVO",
        descripcion: "Claro, didáctico, organizado. Explica conceptos complejos de manera accesible. Usa ejemplos concretos y estructura lógica para facilitar la comprensión."
    },
    
    // Estilo Literario
    literario: {
        titulo: "LITERARIO",
        descripcion: "Creativo, expresivo, evocador. Usa recursos literarios (metáforas, símiles, imágenes sensoriales). Enfocado en la belleza del lenguaje y la experiencia emocional."
    },
    narrativo: {
        titulo: "NARRATIVO",
        descripcion: "Con estructura de historia. Usa elementos narrativos (personajes, conflicto, desarrollo, resolución). Ideal para contar experiencias o casos de estudio."
    },
    poetico: {
        titulo: "POÉTICO",
        descripcion: "Rítmico, metafórico, conciso. Usa imágenes potentes, sonoridad del lenguaje y economía de palabras. Enfocado en la experiencia sensorial y emocional."
    },
    
    // Estilo Conversacional
    amigable: {
        titulo: "AMIGABLE",
        descripcion: "Cálido, cercano, accesible. Usa un tono conversacional como si estuvieras hablando con un amigo. Incluye preguntas retóricas y ejemplos cotidianos."
    },
    coloquial: {
        titulo: "COLOQUIAL",
        descripcion: "Natural, informal, espontáneo. Usa lenguaje cotidiano, contracciones y expresiones comunes. Como una conversación real entre personas."
    },
    
    // Estilo Educativo
    infantil: {
        titulo: "INFANTIL",
        descripcion: "Simple, motivador, lúdico. Usa lenguaje muy sencillo, ejemplos visuales, repeticiones y elementos interactivos. Ideal para niños pequeños."
    },
    simple: {
        titulo: "SIMPLE",
        descripcion: "Claro, directo, sin complicaciones. Usa frases cortas, vocabulario básico y estructura lineal. Perfecto para principiantes o explicaciones básicas."
    },
    didactico: {
        titulo: "DIDÁCTICO",
        descripcion: "Pedagógico, estructurado, progresivo. Divide la información en pasos, incluye ejemplos prácticos y ejercicios de aplicación. Enfocado en el aprendizaje."
    },
    
    // Estilo Especializado
    tecnico: {
        titulo: "TÉCNICO",
        descripcion: "Especializado, preciso, funcional. Usa terminología específica del campo, especificaciones técnicas y detalles operativos. Enfocado en la aplicación práctica."
    },
    formal: {
        titulo: "FORMAL",
        descripcion: "Respetuoso, protocolario, estructurado. Usa fórmulas de cortesía, estructura jerárquica y lenguaje impersonal. Ideal para documentos oficiales."
    },
    profesional: {
        titulo: "PROFESIONAL",
        descripcion: "Competente, eficiente, orientado a resultados. Usa lenguaje de negocio, enfoque en soluciones y terminología del sector. Balance entre formalidad y claridad."
    }
};

// Abrir el modal y guardar el ID del módulo
window.abrirModalTono = function(moduloId) {
    moduloTonoActual = moduloId;
    contenidoGeneradoTono = null;
    
    const modal = document.getElementById("modalCambiarTono");
    
    // Obtener contenido original del módulo
    const contElement = document.getElementById(`contenido-${moduloId}`);
    if (contElement) {
        const contenidoOriginal = contElement.innerHTML.trim();
        
        // Mostrar contenido original (recortado)
        const contOriginalDiv = document.getElementById("contenidoOriginalTono");
        if (contOriginalDiv) {
            // Limitar a 200 caracteres para no saturar
            let textoRecortado = contenidoOriginal.replace(/<[^>]*>/g, ' ').trim();
            if (textoRecortado.length > 200) {
                textoRecortado = textoRecortado.substring(0, 200) + '...';
            }
            contOriginalDiv.textContent = textoRecortado || "(Contenido vacío)";
            
            // Contar palabras
            const palabras = textoRecortado.split(/\s+/).filter(word => word.length > 0).length;
            document.getElementById("palabrasOriginal").textContent = palabras;
        }
    }
    
    // Resetear estado del modal
    document.getElementById("selectTono").value = "";
    document.getElementById("contenidoGeneradoTono").innerHTML = 
        '<p class="text-gray-400 text-sm">Selecciona un tono y haz clic en "Generar Vista Previa"</p>';
    document.getElementById("btnAplicarTono").disabled = true;
    document.getElementById("btnAplicarTono").innerHTML = '<i class="fas fa-check mr-2"></i> Aplicar al módulo';
    document.getElementById("contadorPalabras").classList.add("hidden");
    
    // Ocultar descripción
    const descripcionDiv = document.getElementById("descripcionTono");
    if (descripcionDiv) {
        descripcionDiv.classList.add("hidden");
    }
    
    // Ocultar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    if (modalSpinner) {
        modalSpinner.classList.add("hidden");
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

// Función para mostrar descripción del tono seleccionado
function mostrarDescripcionTono() {
    const tono = document.getElementById("selectTono").value;
    const descripcionDiv = document.getElementById("descripcionTono");
    const textoDescripcion = document.getElementById("textoDescripcion");
    
    if (tono && descripcionesTono[tono]) {
        const info = descripcionesTono[tono];
        textoDescripcion.textContent = info.descripcion;
        descripcionDiv.classList.remove("hidden");
    } else {
        descripcionDiv.classList.add("hidden");
    }
}

// Cerrar el modal
window.cerrarModalTono = function() {
    const modal = document.getElementById("modalCambiarTono");
    if (!modal) return;
    
    // Resetear estados
    moduloTonoActual = null;
    contenidoGeneradoTono = null;
    
    // Ocultar descripción
    const descripcionDiv = document.getElementById("descripcionTono");
    if (descripcionDiv) {
        descripcionDiv.classList.add("hidden");
    }
    
    // Ocultar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    if (modalSpinner) {
        modalSpinner.classList.add("hidden");
    }
    
    // Re-habilitar botones
    const btnGenerar = document.getElementById("btnGenerarTono");
    const btnAplicar = document.getElementById("btnAplicarTono");
    if (btnGenerar) btnGenerar.disabled = false;
    if (btnAplicar) btnAplicar.disabled = true;
    
    // Ocultar modal
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

// Generar vista previa del contenido con nuevo tono
window.generarVistaPreviaTono = async function() {
    if (!moduloTonoActual) {
        alert("Error: No hay módulo seleccionado.");
        return;
    }

    const tono = document.getElementById("selectTono").value;
    if (!tono) {
        alert("Selecciona un tono primero.");
        return;
    }

    // Verificar que el tono existe en las descripciones
    if (!descripcionesTono[tono]) {
        alert(`Error: El tono "${tono}" no está configurado correctamente.`);
        return;
    }

    // Obtener contenido original del módulo
    const contElement = document.getElementById(`contenido-${moduloTonoActual}`);
    if (!contElement) {
        alert("No se encontró el contenido del módulo.");
        return;
    }

    const contenidoOriginal = contElement.innerHTML.trim();
    if (!contenidoOriginal || contenidoOriginal === "<p class='text-xs text-gray-400'>Sin contenido generado.</p>") {
        alert("El módulo no tiene contenido para reescribir.");
        return;
    }

    // Mostrar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    const btnGenerar = document.getElementById("btnGenerarTono");
    const contenidoGeneradoDiv = document.getElementById("contenidoGeneradoTono");
    
    if (modalSpinner) {
        modalSpinner.classList.remove("hidden");
    }
    if (btnGenerar) {
        btnGenerar.disabled = true;
    }
    if (contenidoGeneradoDiv) {
        const infoTono = descripcionesTono[tono];
        contenidoGeneradoDiv.innerHTML = `
            <div class="flex items-center gap-2 text-blue-600 text-sm">
                <i class="fas fa-spinner fa-spin"></i>
                Generando contenido en tono <strong>${infoTono.titulo}</strong>...
            </div>
        `;
    }

    try {
        const endpoint = getGeminiEndpoint();

        const infoTono = descripcionesTono[tono];
        
        const prompt = `
# REESCRIBIR CONTENIDO CON TONO ESPECÍFICO

## TONO REQUERIDO: ${infoTono.titulo}

## CARACTERÍSTICAS DEL TONO:
${infoTono.descripcion}

## CONTENIDO ORIGINAL:
${contenidoOriginal}

## REGLAS ESTRICTAS:
1. MANTÉN EXACTAMENTE la misma estructura HTML original
2. NO cambies el significado ni el contenido informativo
3. NO agregues ni elimines secciones
4. NO uses nuevas etiquetas HTML
5. SOLO modifica el TONO del lenguaje según lo especificado
6. Conserva todas las tablas, listas, formato y elementos HTML
7. NO agregues explicaciones ni comentarios
8. NO uses backticks \`\`\` ni marcas de código

## EJEMPLOS DE TRANSFORMACIÓN:
Si el original dice: "Este es un tema importante"
- Académico: "Este constituye un tema de relevancia académica"
- Científico: "Los datos indican que este tema presenta significancia estadística"
- Periodístico: "Según expertos, este tema reviste importancia"
- Narrativo: "Este tema se desarrolló como una historia fascinante que..."
- Poético: "Este tema, cual joya preciada, brilla con importancia"
- Amigable: "Este es un tema muy importante que debemos entender"
- Infantil: "Este es un tema súper importante, ¡como un tesoro!"

Devuelve SOLO el contenido reescrito en HTML.
NO agregues comentarios, ni explicaciones, ni etiquetas adicionales.
`;

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status} - ${res.statusText}`);
        }

        const data = await res.json();
        const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text || contenidoOriginal;

        // Limpiar respuesta
        let nuevoContenido = textoRespuesta
            .replace(/```html/gi, "")
            .replace(/```/g, "")
            .replace(/^"|"$/g, '')
            .trim();

        // Guardar el contenido generado para posible aplicación
        contenidoGeneradoTono = nuevoContenido;

        // Mostrar en el modal
        if (contenidoGeneradoDiv) {
            contenidoGeneradoDiv.innerHTML = nuevoContenido;
            
            // Contar palabras del nuevo contenido
            const textoLimpio = nuevoContenido.replace(/<[^>]*>/g, ' ').trim();
            const palabrasNuevas = textoLimpio.split(/\s+/).filter(word => word.length > 0).length;
            
            // Mostrar contador
            const contadorDiv = document.getElementById("contadorPalabras");
            const palabrasNuevoSpan = document.getElementById("palabrasNuevo");
            if (contadorDiv && palabrasNuevoSpan) {
                palabrasNuevoSpan.textContent = palabrasNuevas;
                contadorDiv.classList.remove("hidden");
            }
        }

        // Habilitar botón de aplicar
        const btnAplicar = document.getElementById("btnAplicarTono");
        if (btnAplicar) {
            btnAplicar.disabled = false;
            btnAplicar.innerHTML = `<i class="fas fa-check mr-2"></i> Aplicar (${infoTono.titulo})`;
        }

    } catch (err) {
        
        if (contenidoGeneradoDiv) {
            contenidoGeneradoDiv.innerHTML = `
                <div class="text-red-600 text-sm">
                    <p>Error al generar el contenido:</p>
                    <p class="text-xs mt-2">${err.message}</p>
                    <button onclick="generarVistaPreviaTono()" 
                            class="mt-3 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                        Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        // Ocultar spinner y re-habilitar botón generar
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }
        if (btnGenerar) {
            btnGenerar.disabled = false;
        }
    }
};

// Aplicar el contenido generado al módulo
window.aplicarCambioTono = async function() {
    if (!moduloTonoActual || !contenidoGeneradoTono) {
        alert("Error: No hay contenido generado para aplicar.");
        return;
    }

    const tono = document.getElementById("selectTono").value;
    if (!tono) {
        alert("Error: No se ha seleccionado un tono.");
        return;
    }

    // Obtener elemento del contenido original
    const contElement = document.getElementById(`contenido-${moduloTonoActual}`);
    if (!contElement) {
        alert("Error: No se encontró el módulo.");
        cerrarModalTono();
        return;
    }

    // Mostrar spinner de aplicación
    const modalSpinner = document.getElementById("spinnerTono");
    const btnAplicar = document.getElementById("btnAplicarTono");
    
    if (modalSpinner) {
        modalSpinner.classList.remove("hidden");
        modalSpinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Aplicando contenido al módulo...`;
    }
    if (btnAplicar) {
        btnAplicar.disabled = true;
    }

    try {
        // Actualizar en la página
        contElement.innerHTML = contenidoGeneradoTono;

        // Guardar en Firebase
        await guardarModulo(moduloTonoActual, { contenido: contenidoGeneradoTono });

        // Ocultar spinner
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }

        // Cerrar modal
        cerrarModalTono();

        // Mostrar mensaje de éxito en el módulo
        setTimeout(() => {
            const modSpinner = document.getElementById(`spinner-${moduloTonoActual}`);
            if (modSpinner) {
                modSpinner.classList.remove("hidden");
                const infoTono = descripcionesTono[tono] || { titulo: tono };
                modSpinner.innerHTML = `<span class="text-green-600 text-xs">✓ Tono cambiado a ${infoTono.titulo}</span>`;
                setTimeout(() => modSpinner.classList.add("hidden"), 3000);
            }
        }, 100);

        // Reactivar acciones en párrafos
        setTimeout(() => {
            if (typeof activarAccionesEnParrafos === 'function') {
                activarAccionesEnParrafos();
            }
        }, 200);

        // Mostrar alerta de éxito
        const infoTono = descripcionesTono[tono] || { titulo: tono };
        alert(`✓ Contenido actualizado con tono ${infoTono.titulo}`);

    } catch (err) {
        
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }
        if (btnAplicar) {
            btnAplicar.disabled = false;
        }
        
        alert(`Error al guardar el contenido: ${err.message}`);
    }
};

// Agrega esto en el DOMContentLoaded o al final de moodleCourse.js
document.addEventListener('DOMContentLoaded', function() {
    // Conectar botón Cancelar
    const btnCancelarTono = document.getElementById("btnCancelarTono");
    if (btnCancelarTono) {
        btnCancelarTono.onclick = function() {
            window.cerrarModalTono();
        };
    }
    
    // Conectar botón Generar Vista Previa
    const btnGenerarTono = document.getElementById("btnGenerarTono");
    if (btnGenerarTono) {
        btnGenerarTono.onclick = function() {
            window.generarVistaPreviaTono();
        };
    }
    
    // Conectar botón Aplicar
    const btnAplicarTono = document.getElementById("btnAplicarTono");
    if (btnAplicarTono) {
        btnAplicarTono.onclick = function() {
            window.aplicarCambioTono();
        };
    }
    
    // Mostrar descripción cuando se selecciona un tono
    const selectTono = document.getElementById("selectTono");
    if (selectTono) {
        selectTono.addEventListener('change', mostrarDescripcionTono);
        
        // También permitir Enter para generar
        selectTono.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                window.generarVistaPreviaTono();
            }
        });
    }
});




// ===============================
// CREAR TABLA A PARTIR DEL MÓDULO
// ===============================

let moduloCrearTablaId = null;
let htmlOriginalModuloTabla = "";

// Abrir modal y cargar contenido actual del módulo
window.abrirModalCrearTabla = function (moduloId) {
    moduloCrearTablaId = moduloId;

    const cont = document.getElementById(`contenido-${moduloId}`);
    htmlOriginalModuloTabla = cont ? cont.innerHTML : "";

    const previewOrigen = document.getElementById("tablaPreviewOrigen");
    if (previewOrigen) {
        previewOrigen.innerHTML = htmlOriginalModuloTabla || 
            "<p class='text-xs text-gray-400'>Sin contenido para organizar.</p>";
    }

    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (previewTabla) previewTabla.innerHTML = "";

    document.getElementById("modalCrearTablaModulo").classList.remove("hidden");
};

window.cerrarModalCrearTabla = function () {
    document.getElementById("modalCrearTablaModulo").classList.add("hidden");
    moduloCrearTablaId = null;
    htmlOriginalModuloTabla = "";
};




// Botón "Generar vista previa"
// ===========================================
// PREVISUALIZACIÓN INTELIGENTE CON GEMINI
// ===========================================

window.previsualizarTablaModulo = async function () {
    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) return;

    previewTabla.innerHTML = `
        <div class="text-blue-600 text-xs flex items-center gap-2">
            <i class="fas fa-spinner fa-spin"></i> Analizando contenido con IA...
        </div>
    `;

    const endpoint = getGeminiEndpoint();

    const prompt = `
Convierte TODO el siguiente contenido en UNA SOLA TABLA HTML organizada.

REGLAS IMPORTANTES:
- No agregues texto fuera de la tabla.
- No expliques nada.
- No agregues comentarios.
- No uses markdown.
- No uses \`\`\`.
- No inventes contenido.
- Agrupa información por categorías detectadas.
- Decide cuántas columnas necesita la tabla.
- Si detectas "Etiqueta: valor", usa una columna para etiqueta y otra para el contenido.
- Si detectas listas, conviértelas en filas.
- Si detectas secciones o títulos, conviértelos en <th>.
- Devuelve SOLO <table>...</table>.

=== CONTENIDO ORIGINAL ===
${htmlOriginalModuloTabla}
    `;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        let tablaHTML = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // ❗ SIN limpiar nada. SIN alterar lo que Gemini devuelve.
        previewTabla.innerHTML = tablaHTML;

    } catch (error) {
        previewTabla.innerHTML = `
            <p class="text-red-500 text-xs">Error generando tabla con IA.</p>
        `;
    }
};

// Botón "Aplicar al módulo" → reemplaza contenido y guarda en Firestore
window.aplicarTablaModulo = async function () {
    if (!moduloCrearTablaId) {
        alert("No hay módulo seleccionado.");
        return;
    }

    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) {
        alert("No se encontró la vista previa generada.");
        return;
    }

    // ❗ ESTA ES LA TABLA EXACTA QUE GENERÓ GEMINI
    const tablaHTML = previewTabla.innerHTML.trim();

    if (!tablaHTML || tablaHTML.length < 10) {
        alert("La tabla generada está vacía o no es válida.");
        return;
    }

    // Reemplazar contenido en pantalla
    const cont = document.getElementById(`contenido-${moduloCrearTablaId}`);
    if (cont) cont.innerHTML = tablaHTML;

    try {
        // Guardar EXACTAMENTE lo que devolvió Gemini
        await guardarModulo(moduloCrearTablaId, { contenido: tablaHTML });

    } catch (err) {
        alert("La tabla se aplicó en pantalla, pero hubo error al guardar en Firebase.");
    }

    cerrarModalCrearTabla();
};

window.copiarTablaPreview = async function () {
    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) return;

    const table = previewTabla.querySelector("table");
    const html = table ? table.outerHTML : previewTabla.innerHTML;

    if (!html || !html.trim()) {
        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("No hay tabla para copiar.", "info");
        } else {
            alert("No hay tabla para copiar.");
        }
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(html);
        } else {
            const temp = document.createElement("textarea");
            temp.value = html;
            temp.setAttribute("readonly", "");
            temp.style.position = "absolute";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
        }

        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("Tabla copiada al portapapeles.", "success");
        } else {
            alert("Tabla copiada al portapapeles.");
        }
    } catch (err) {
        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("No se pudo copiar la tabla.", "error");
        } else {
            alert("No se pudo copiar la tabla.");
        }
    }
};





window.activarAccionesEnParrafos = function () {
    // 🔥 CORRECCIÓN: Eliminar completamente los menús contextuales al pasar el mouse
    // Solo dejaremos el menú de formato que aparece al seleccionar texto
    
    // Limpiar cualquier menú contextual existente
    document.querySelectorAll('.parrafo-actions').forEach(el => {
        el.remove();
    });
    
    // También eliminar estilos añadidos anteriormente
    const elementos = document.querySelectorAll(`
        #resultadoGenerado p, #resultadoGenerado li, #resultadoGenerado td, #resultadoGenerado th,
        #resultadoGenerado h1, #resultadoGenerado h2, #resultadoGenerado h3, #resultadoGenerado h4,
        .modulo-contenido p, .modulo-contenido li, .modulo-contenido td, .modulo-contenido th,
        .modulo-contenido h1, .modulo-contenido h2, .modulo-contenido h3, .modulo-contenido h4,
        #contenidoTraduccionModulo p, #contenidoTraduccionModulo li, #contenidoTraduccionModulo td,
        #contenidoTraduccionModulo th, #contenidoTraduccionModulo h1, #contenidoTraduccionModulo h2,
        #contenidoTraduccionModulo h3, #contenidoTraduccionModulo h4,
        #contenidoTraduccionSubtema p, #contenidoTraduccionSubtema li, #contenidoTraduccionSubtema td,
        #contenidoTraduccionSubtema th, #contenidoTraduccionSubtema h1, #contenidoTraduccionSubtema h2,
        #contenidoTraduccionSubtema h3, #contenidoTraduccionSubtema h4
    `);
    
    // Quitar estilos específicos añadidos anteriormente
    elementos.forEach(el => {
        el.style.position = "";
        el.style.display = "";
        el.style.paddingRight = "";
        el.classList.remove('parrafo-editando');
    });
    
};


async function guardarContenidoDeTodosLosModulos() {
    if (!subtemaActivo || !subtemaActivo.modulosIds) return;

    const modContenedores = document.querySelectorAll(".modulo-contenido");

    for (let div of modContenedores) {
        const moduloId = div.closest("[id^='modulo-']")?.id.replace("modulo-", "");
        if (!moduloId) continue;

        await guardarModulo(moduloId, {
            contenido: div.innerHTML
        });
    }

    // guardar contenido generado del subtema
    const gen = document.getElementById("resultadoGenerado");
    if (gen) {
        subtemaActivo.contenidoGenerado = gen.innerHTML;
    }

    await guardarCursoFirebase();
}


function activarEdicionInlineParrafo(p) {
    // Evitar reactivar si ya está editable
    if (p.isContentEditable) return;

    // Estilos visuales de edición
    p.contentEditable = "true";
    p.classList.add("parrafo-editando");
    p.style.border = "1px dashed #4AA3FF";
    p.style.padding = "6px";
    p.style.background = "#f0f9ff";

    p.focus();

    // Al salir del párrafo → guardar
    p.addEventListener("blur", () => {
        p.contentEditable = "false";
        p.classList.remove("parrafo-editando");
        p.style.border = "";
        p.style.background = "";
        p.style.padding = "";

        // Guardar el contenido actualizado en Firebase
        guardarContenidoGenerado();

        // Reactivar los iconos
        activarAccionesEnParrafos();
    }, { once: true });
}


function guardarContenidoGenerado() {
    const cont = document.getElementById("resultadoGenerado");
    if (!cont) return;

    subtemaActivo.contenidoGenerado = cont.innerHTML;
    guardarCursoFirebase();
}




async function mostrarSpinnerReformular(elemento) {
    // Si ya existe un spinner, no lo dupliques
    if (elemento.querySelector(".ai-reformulando")) return;

    const spinner = document.createElement("div");
    spinner.className = "ai-reformulando";
    spinner.innerHTML = `
        <div class="cb-reform-spinner-badge">
            <i class="fas fa-spinner fa-spin"></i>
            Reformulando...
        </div>
    `;
    elemento.classList.add("cb-relative");
    elemento.appendChild(spinner);

    return spinner;
}






/* ============================================================
      MENU DE FORMATO PARA TEXTO SELECCIONADO
============================================================ */

let formatMenu = null;
let currentSelection = null;


// Inicializar menú cuando cargue la página
document.addEventListener("DOMContentLoaded", () => {
    formatMenu = document.getElementById("textFormatMenu");
    activarMenuFormatoSeleccion();
    
    // 🔥 AÑADE ESTO para inicializar el modal de reformular
    inicializarModalReformular();
});


function inicializarModalReformular() {
    const radios = document.querySelectorAll('input[name="tipoReformulacion"]');
    const inputPersonalizadoContainer = document.getElementById("inputPersonalizadoContainer");
    
    if (!radios.length) {
        return;
    }
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === "personalizado") {
                if (inputPersonalizadoContainer) {
                    inputPersonalizadoContainer.classList.remove("hidden");
                    document.getElementById("instruccionesPersonalizadas")?.focus();
                }
            } else {
                if (inputPersonalizadoContainer) {
                    inputPersonalizadoContainer.classList.add("hidden");
                }
            }
        });
    });
    
    // Botón Cancelar
    const btnCancelar = document.getElementById("btnCancelarReformular");
    const btnConfirmar = document.getElementById("btnConfirmarReformular");
    
}


function activarMenuFormatoSeleccion() {
    document.addEventListener("mouseup", manejarSeleccionTexto);
    document.addEventListener("keyup", manejarSeleccionTexto);

    // Cerrar al hacer clic afuera
    document.addEventListener("click", (e) => {
        if (!formatMenu.contains(e.target)) {
            formatMenu.classList.add("hidden");
        }
    });

    // Acciones del menú
    formatMenu.addEventListener("click", (e) => {
        
        const action = e.target.closest("button")?.dataset?.action;
        
        if (!action) return;
        
        // Llamar a la función correcta
        ejecutarAccionFormato(action);
        
        formatMenu.classList.add("hidden");
    });

}

function manejarSeleccionTexto(e) {
    setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim() === "") {
            formatMenu.classList.add("hidden");
            return;
        }

        if (!sel.rangeCount) return;

        currentSelection = sel.getRangeAt(0);
        
        // 🔥 CORRECCIÓN: Solo mostrar menú si la selección está dentro de .modulo-contenido
        const commonAncestor = currentSelection.commonAncestorContainer;
        const isInsideModuloContenido = commonAncestor.closest?.('.modulo-contenido');
        const isInsideGenerado = commonAncestor.closest?.('#resultadoGenerado');
        const isInsideTraduccion = commonAncestor.closest?.('#contenidoTraduccionModulo, #contenidoTraduccionSubtema');
        
        // Si no está en ninguna de estas áreas permitidas, no mostrar menú
        if (!isInsideModuloContenido && !isInsideGenerado && !isInsideTraduccion) {
            formatMenu.classList.add("hidden");
            return;
        }

        // NO mostrar si selecciona dentro del menú
        if (formatMenu.contains(sel.anchorNode)) return;

        // Posicionar el menú
        const rect = currentSelection.getBoundingClientRect();
        formatMenu.style.top = `${rect.top + window.scrollY - 40}px`;
        formatMenu.style.left = `${rect.left + window.scrollX}px`;
        formatMenu.classList.remove("hidden");
    }, 50);
}


function ejecutarAccionFormato(action) {
    if (!currentSelection) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    switch (action) {
        case "bold":
        case "italic":
        case "clear":
            // Usar las funciones existentes para formato
            ejecutarAccionFormatoBase(action);
            break;
            
        case "reformular":
            // 🔥 CORRECCIÓN: Abrir modal en lugar de reformular automáticamente
            mostrarModalReformular();
            break;
            
        case "delete":
            eliminarSeleccion();
            break;
    }
}


function ejecutarAccionFormatoBase(action) {
    const range = currentSelection.cloneRange();
    const container = range.commonAncestorContainer;
    
    if (container.nodeType === Node.TEXT_NODE) {
        const parent = container.parentElement;
        
        // Si ya tiene el formato y queremos aplicar el mismo, quitar formato
        if (action === "bold" && (parent.tagName === 'STRONG' || parent.tagName === 'B')) {
            limpiarFormatoSeleccionado();
            return;
        }
        
        if (action === "italic" && (parent.tagName === 'EM' || parent.tagName === 'I')) {
            limpiarFormatoSeleccionado();
            return;
        }
    }

    let wrapper;

    switch (action) {
        case "bold":
            wrapper = document.createElement("strong");
            break;

        case "italic":
            wrapper = document.createElement("em");
            break;

        case "clear":
            limpiarFormatoSeleccionado();
            return;
    }

    try {
        if (range.toString().trim() === "" || range.collapsed) {
            return;
        }
        
        range.surroundContents(wrapper);
        guardarContenidoEditado();
    } catch (e) {
        const text = range.toString();
        if (text.trim()) {
            wrapper.textContent = text;
            range.deleteContents();
            range.insertNode(wrapper);
            guardarContenidoEditado();
        }
    }
}


function mostrarModalReformular() {
    
    const modal = document.getElementById("modalReformular");
    
    // Verificar si hay estilos que lo ocultan

    
    if (!currentSelection) {
        return;
    }
    
    textoOriginalParaReformular = currentSelection.toString().trim();
    seleccionOriginalParaReformular = currentSelection;
    
    
    if (!textoOriginalParaReformular) {
        alert("No hay texto seleccionado para reformular.");
        return;
    }
    
    if (!modal) {
        alert("Error: No se puede abrir el modal de reformulación");
        return;
    }
    
    const preview = document.getElementById("textoSeleccionadoPreview");
    if (!preview) {
    } else {
        // Mostrar texto seleccionado (recortado si es muy largo)
        let textoPreview = textoOriginalParaReformular;
        if (textoPreview.length > 200) {
            textoPreview = textoPreview.substring(0, 200) + "...";
        }
        preview.textContent = textoPreview;
    }
    
    // Resetear valores
    const radioMejorar = document.querySelector('input[name="tipoReformulacion"][value="mejorar"]');
    if (radioMejorar) {
        radioMejorar.checked = true;
    }
    
    const inputContainer = document.getElementById("inputPersonalizadoContainer");
    if (inputContainer) {
        inputContainer.classList.add("hidden");
    }
    
    const instruccionesInput = document.getElementById("instruccionesPersonalizadas");
    if (instruccionesInput) {
        instruccionesInput.value = "";
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar en el modal
    setTimeout(() => {
        document.getElementById("instruccionesPersonalizadas")?.focus();
    }, 100);
}

// Manejar cambio en tipo de reformulación
document.addEventListener('DOMContentLoaded', function() {
    const radios = document.querySelectorAll('input[name="tipoReformulacion"]');
    const inputPersonalizadoContainer = document.getElementById("inputPersonalizadoContainer");
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === "personalizado") {
                inputPersonalizadoContainer.classList.remove("hidden");
                document.getElementById("instruccionesPersonalizadas").focus();
            } else {
                inputPersonalizadoContainer.classList.add("hidden");
            }
        });
    });
    
    // Botón Cancelar
    document.getElementById("btnCancelarReformular").addEventListener("click", function() {
        document.getElementById("modalReformular").classList.add("hidden");
    });
    
    // Botón Confirmar
    document.getElementById("btnConfirmarReformular").addEventListener("click", ejecutarReformulacionConInstrucciones);
});

// Función principal para reformular con instrucciones
async function ejecutarReformulacionConInstrucciones() {
    const modal = document.getElementById("modalReformular");
    const btnConfirmar = document.getElementById("btnConfirmarReformular");
    
    if (!seleccionOriginalParaReformular || !textoOriginalParaReformular) {
        alert("Error: No hay texto seleccionado.");
        return;
    }
    
    // Obtener tipo de reformulación seleccionado
    const tipoSeleccionado = document.querySelector('input[name="tipoReformulacion"]:checked').value;
    const idiomaDetectado = detectarIdiomaParaNotas(textoOriginalParaReformular || "");
    
    // Construir prompt según el tipo
    let instruccionesIA = "";
    
    switch (tipoSeleccionado) {
        case "mejorar":
            instruccionesIA = construirInstruccionReformulacion("mejorar", idiomaDetectado);
            break;
        case "simplificar":
            instruccionesIA = construirInstruccionReformulacion("simplificar", idiomaDetectado);
            break;
        case "formal":
            instruccionesIA = construirInstruccionReformulacion("formal", idiomaDetectado);
            break;
        case "coloquial":
            instruccionesIA = construirInstruccionReformulacion("coloquial", idiomaDetectado);
            break;
        case "extender":
            instruccionesIA = construirInstruccionReformulacion("extender", idiomaDetectado);
            break;
        case "resumir":
            instruccionesIA = construirInstruccionReformulacion("resumir", idiomaDetectado);
            break;
        case "personalizado":
            const instruccionesPersonal = document.getElementById("instruccionesPersonalizadas").value.trim();
            if (!instruccionesPersonal) {
                alert("Por favor, escribe instrucciones personalizadas.");
                document.getElementById("instruccionesPersonalizadas").focus();
                return;
            }
            instruccionesIA = construirInstruccionReformulacion("personalizado", idiomaDetectado, instruccionesPersonal);
            break;
    }
    
    // Mostrar loading
    const originalBtnText = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Reformulando...';
    
    try {
        // Llamar a la función de IA
        const textoReformulado = await reformularTextoConIA(textoOriginalParaReformular, instruccionesIA, idiomaDetectado);
        
        // Reemplazar el texto en el documento
        seleccionOriginalParaReformular.deleteContents();
        const nuevoNodo = document.createTextNode(textoReformulado);
        seleccionOriginalParaReformular.insertNode(nuevoNodo);
        
        // Guardar cambios
        guardarContenidoEditado();
        
        // Cerrar modal
        modal.classList.add("hidden");
        
        // Mostrar notificación
        mostrarNotificacion("✅ Texto reformulado exitosamente", 'success');
        
    } catch (error) {
        mostrarNotificacion("❌ Error al reformular el texto", 'error');
    } finally {
        // Restaurar botón
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = originalBtnText;
    }
}

function construirInstruccionReformulacion(tipo, idiomaDetectado, personalizado = "") {
    const lang = idiomaDetectado?.code || "es";

    const instruccionesPorIdioma = {
        es: {
            mejorar: "Mejora la redacción de este texto manteniendo el mismo significado. Hazlo más claro, coherente y profesional.",
            simplificar: "Simplifica este texto para que sea más fácil de entender. Usa lenguaje más sencillo y directo.",
            formal: "Convierte este texto a un tono formal y académico. Usa lenguaje profesional y estructuras complejas.",
            coloquial: "Convierte este texto a un tono coloquial y conversacional, natural y cercano.",
            extender: "Extiende este texto. Añade detalles útiles y ejemplos sin cambiar el significado original.",
            resumir: "Resume este texto de forma concisa, conservando las ideas principales.",
            personalizado: `${personalizado}`
        },
        en: {
            mejorar: "Improve the writing while keeping the same meaning. Make it clearer, coherent, and professional.",
            simplificar: "Simplify this text so it is easier to understand. Use plain and direct language.",
            formal: "Rewrite this text in a formal academic tone using professional wording.",
            coloquial: "Rewrite this text in a conversational and natural tone.",
            extender: "Expand this text by adding useful details and examples without changing the original meaning.",
            resumir: "Summarize this text concisely while preserving the main ideas.",
            personalizado: `${personalizado}`
        },
        pt: {
            mejorar: "Melhore a redação deste texto mantendo o mesmo significado. Torne-o mais claro, coerente e profissional.",
            simplificar: "Simplifique este texto para que seja mais fácil de entender. Use linguagem simples e direta.",
            formal: "Reescreva este texto em tom formal e acadêmico.",
            coloquial: "Reescreva este texto em tom coloquial e conversacional.",
            extender: "Expanda este texto com detalhes úteis sem alterar o significado original.",
            resumir: "Resuma este texto de forma concisa mantendo as ideias principais.",
            personalizado: `${personalizado}`
        },
        fr: {
            mejorar: "Améliore la rédaction de ce texte en conservant le même sens. Rends-le plus clair, cohérent et professionnel.",
            simplificar: "Simplifie ce texte pour qu'il soit plus facile à comprendre. Utilise un langage simple et direct.",
            formal: "Réécris ce texte dans un ton formel et académique.",
            coloquial: "Réécris ce texte dans un ton conversationnel et naturel.",
            extender: "Développe ce texte avec des détails utiles sans changer le sens original.",
            resumir: "Résume ce texte de manière concise en gardant les idées principales.",
            personalizado: `${personalizado}`
        }
    };

    const pack = instruccionesPorIdioma[lang] || instruccionesPorIdioma.es;
    const instruccion = pack[tipo] || pack.mejorar;
    return `${instruccion}`.trim();
}

// Nueva función para reformular texto con instrucciones específicas
async function reformularTextoConIA(textoOriginal, instrucciones, idiomaDetectado = { code: "es", label: "español" }) {
    try {
        const endpoint = getGeminiEndpoint();
        const idiomaLabel = idiomaDetectado?.label || "español";
        const idiomaCode = idiomaDetectado?.code || "es";
        
        const prompt = `
${instrucciones}

IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado del texto original: ${idiomaLabel} (${idiomaCode}).
- Devuelve la reformulación COMPLETAMENTE en ${idiomaLabel}.
- No cambies de idioma.

TEXTO ORIGINAL:
${textoOriginal}

REGLAS IMPORTANTES:
- NO cambies el significado fundamental
- NO agregues información que no esté implícita
- NO uses marcas como \`\`\` o comillas
- Devuelve SOLO el texto reformulado
- Mantén la misma longitud aproximada (a menos que sea extender o resumir)
        `;
        
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        let textoReformulado = data?.candidates?.[0]?.content?.parts?.[0]?.text || textoOriginal;
        
        // Limpiar respuesta
        textoReformulado = textoReformulado
            .replace(/```/g, "")
            .replace(/^"|"$/g, '')
            .trim();
        
        return textoReformulado;
        
    } catch (error) {
        throw error;
    }
}


async function reformularSeleccionConIA() {
    const textoSeleccionado = currentSelection.toString().trim();
    if (!textoSeleccionado) return;

    try {
        // Mostrar spinner en el menú
        const menu = document.getElementById("textFormatMenu");
        const originalHTML = menu.innerHTML;
        menu.innerHTML = '<div class="px-3 py-1 text-sm"><i class="fas fa-spinner fa-spin"></i> Reformulando...</div>';

        // Usar la función de reformular que ya tienes
        if (typeof reformularParrafoConIA === 'function') {
            const textoReformulado = await reformularParrafoConIA(textoSeleccionado);
            
            // Reemplazar la selección
            currentSelection.deleteContents();
            const nuevoNodo = document.createTextNode(textoReformulado);
            currentSelection.insertNode(nuevoNodo);
            
            guardarContenidoEditado();
            
            // Restaurar menú
            menu.innerHTML = originalHTML;
        }
    } catch (error) {
        alert("Error al reformular con IA");
    }
}

function eliminarSeleccion() {
    if (!confirm("¿Eliminar el texto seleccionado?")) return;
    
    try {
        currentSelection.deleteContents();
        guardarContenidoEditado();
    } catch (error) {
    }
}

function envolverSeleccion(wrapper) {
    const range = currentSelection.cloneRange();
    range.surroundContents(wrapper);
}

function limpiarFormatoSeleccionado() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    
    // Obtener el elemento contenedor más cercano
    let container = range.commonAncestorContainer;
    
    // Si el contenedor es un nodo de texto, subir al elemento padre
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }
    
    // Verificar si el contenedor ya tiene formato (strong o em)
    const isBold = container.tagName === 'STRONG' || container.tagName === 'B';
    const isItalic = container.tagName === 'EM' || container.tagName === 'I';
    
    if (isBold || isItalic) {
        // Reemplazar el elemento formateado por su contenido
        const fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }
        container.parentNode.replaceChild(fragment, container);
        
        // Restaurar la selección
        const newRange = document.createRange();
        newRange.setStart(fragment, 0);
        newRange.setEnd(fragment, fragment.childNodes.length);
        sel.removeAllRanges();
        sel.addRange(newRange);
    } else {
        // Método original para contenido seleccionado dentro de párrafos
        const content = range.extractContents();
        content.querySelectorAll("strong, em, b, i").forEach(el => {
            el.replaceWith(...el.childNodes);
        });
        range.insertNode(content);
    }
}



function guardarContenidoEditado() {

    /* ================================
       1) SUBTEMA — resultadoGenerado
    ================================ */
    const contSubtema = document.getElementById("resultadoGenerado");
    if (contSubtema && contSubtema.contains(currentSelection.startContainer)) {

        if (!window.subtemaActivo) return;
        window.subtemaActivo.contenidoGenerado = contSubtema.innerHTML;

        guardarCursoFirebase();
        return;
    }

    /* ================================
       2) MÓDULO ACTIVO
    ================================ */
    const contModulo = document.querySelector(".modulo-activo .modulo-contenido");

    if (contModulo && contModulo.contains(currentSelection.startContainer)) {

        const modId = localStorage.getItem("moduloActivo");
        if (modId) {
            guardarModulo(modId, { contenido: contModulo.innerHTML });
        }

        return;
    }

    /* ================================
       3) TRADUCCIÓN DE SUBTEMA
    ================================ */
    const contTrad = document.getElementById("contenidoTraduccionSubtema");
    if (contTrad && contTrad.contains(currentSelection.startContainer)) {

        const sub = window.subtemaActivo;
        if (!sub) return;

        const idTrad = contTrad.dataset.traduccionId;
        const trad = sub.traducciones.find(t => t.id === idTrad);

        if (trad) {
            trad.contenido = contTrad.innerHTML;
            guardarCursoFirebase();
        }

        return;
    }

    /* ================================
       4) TRADUCCIÓN DE MÓDULO
    ================================ */
    const contModTrad = document.getElementById("contenidoTraduccionModulo");
    if (contModTrad && contModTrad.contains(currentSelection.startContainer)) {

        const sub = window.subtemaActivo;
        if (!sub) return;

        const modId = localStorage.getItem("moduloActivo");
        if (modId) {
            const contModulo = document.querySelector(`#modulo-${modId} .modulo-contenido`);

            if (contModulo && contModulo.contains(currentSelection.startContainer)) {
                guardarModulo(modId, { contenido: contModulo.innerHTML });
                return;
            }
        }
    }   

}



/* ============================================
   MENÚ CONTEXTUAL PARA TEMAS / SUBTEMAS / MÓDULOS
============================================ */
let contextTarget = null; // referencia al item seleccionado





function activarEdicionInlineModulo(liMod, modulo) {
    const spanNombre = liMod.querySelector(".modulo-nombre");

    // Crear input
    const input = document.createElement("input");
    input.type = "text";
    input.value = modulo.nombre;
    input.className = "w-full text-xs p-1 border rounded bg-white";

    // Reemplazar el span por el input
    spanNombre.replaceWith(input);
    input.focus();

    // Guardar al presionar Enter
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            modulo.nombre = input.value.trim() || modulo.nombre;
            await guardarCursoFirebase();
            renderTemas();
        }
    });

    // Guardar al perder foco
    input.addEventListener("blur", async () => {
        modulo.nombre = input.value.trim() || modulo.nombre;
        await guardarCursoFirebase();
        renderTemas();
    });
}




function activarEdicionInlineGeneral(span, objeto) {
    if (!span) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = objeto.nombre;
    input.className = "w-full text-xs p-1 border rounded bg-white";

    span.replaceWith(input);
    input.focus();

    function guardar() {
        objeto.nombre = input.value.trim() || objeto.nombre;
        guardarCursoFirebase();
        renderTemas();
    }

    input.addEventListener("keydown", e => e.key === "Enter" && guardar());
    input.addEventListener("blur", guardar);
}




/* BOTÓN: GUARDAR MANUAL EN FIREBASE */
const btnGuardarFirebase = document.getElementById("btnGuardarFirebase");
if (btnGuardarFirebase) {
    btnGuardarFirebase.addEventListener("click", async () => {
        if (!cursoDocId) return;
        
        // Verificar si el usuario actual tiene permisos para editar
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        
        if (!cursoActual) {
            alert("Curso no encontrado");
            return;
        }
        
        if (!cursoActual.esPropio && !cursoActual.permisos.editar) {
            alert("No tienes permisos para guardar cambios en este curso");
            return;
        }
        
        await guardarCursoFirebase();
        
        // Feedback visual
        const icon = btnGuardarFirebase.querySelector("i");
        if (!icon) return;
        icon.classList.remove('fa-cloud-arrow-up');
        icon.classList.add('fa-check');
        setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-cloud-arrow-up');
        }, 2000);
    });
}



/* BOTÓN: DESCARGAR WORD */
/* BOTÓN: DESCARGAR WORD */
const btnDescargarWord = document.getElementById("btnDescargarWord");
if (btnDescargarWord) {
    btnDescargarWord.addEventListener("click", () => {

    const cont = document.getElementById("contenidoEditor");
    if (!cont) {
        alert("No se encontró contenido para exportar.");
        return;
    }

    // 1. Clonar el div para eliminar botones, íconos y basura visual
    const clone = cont.cloneNode(true);

    // Limpieza visual para Word
    clone.querySelectorAll(".icon-btn, .fa-trash, .fa-pen, .fa-copy, .btn-edit-tema, .btn-delete-tema, .btn-edit-modulo, .btn-delete-modulo").forEach(el => el.remove());
    clone.querySelectorAll(".parrafo-actions").forEach(el => el.remove());
    clone.querySelectorAll("label.section-title").forEach(el => el.remove());

    // Quitar bloques de notas pedagógicas/metadatos que no deben exportarse
    clone.querySelectorAll("div.rounded-lg.border.bg-background.p-4.shadow-sm, div.rounded-lg.border.bg-muted\\/40.p-4, div.text-xs.text-gray-500").forEach(el => el.remove());
    clone.querySelectorAll('[data-modulo-archivado="true"]').forEach(el => el.remove());
    clone.querySelectorAll("*").forEach(el => {
        const txt = (el.textContent || "").trim();
        if (txt === "Notas pedagógicas para el docente" || txt.startsWith("Módulo analizado:") || txt.startsWith("Generado:") || txt.startsWith("Guardado:")) {
            el.remove();
        }
    });

    // Ocultar tipo del módulo y agrandar el nombre del módulo en export
    clone.querySelectorAll("[id^='modulo-'] > div:first-child > div > p.text-xs.text-gray-500").forEach(el => el.remove());
    clone.querySelectorAll("[id^='modulo-'] > div:first-child > div > p.font-semibold").forEach(el => {
        el.classList.add("modulo-nombre-word");
    });
    clone.querySelectorAll("h1.font-semibold.text-slate-900.mt-3.mb-2").forEach(el => {
        const h2 = document.createElement("h2");
        h2.className = "word-titulo2";
        h2.innerHTML = el.innerHTML;
        el.replaceWith(h2);
    });

    // 2. Obtener el HTML limpio del editor
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${temaActivo?.nombre || "Documento"}</title>
<style>
    body { font-family: Arial, sans-serif; font-size: 11pt; }
    h1, h2, h3, h4 { font-weight: bold; }
    .modulo-nombre-word { font-size: 24pt !important; line-height: 1.15 !important; font-weight: 700 !important; margin: 12px 0 8px 0 !important; }
    .word-titulo2 { font-size: 18pt !important; font-weight: 700 !important; margin: 10px 0 6px 0 !important; }
</style>
</head>
<body>
${clone.innerHTML}
</body>
</html>
`;

    // 3. Convertir a Word con html-docx-js
    try {
        const blob = window.htmlDocx.asBlob(html);

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${temaActivo?.nombre || "Documento"}.docx`;
        a.click();
    } catch (e) {
        alert("Error generando Word.");
    }
    });
}


async function exportarTemaWord(tema) {

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${tema.nombre}</title>
<style>
    body { font-family: Arial, sans-serif; font-size: 11pt; }
    h1, h2, h3, h4 { font-weight: bold; }
    .modulo-nombre-word { font-size: 24pt; line-height: 1.15; margin: 14px 0 8px 0; font-weight: 700; }
    .word-titulo2 { font-size: 18pt; margin: 10px 0 6px 0; font-weight: 700; }
    .subtema { margin-top: 25px; }
    .modulo { margin-top: 15px; }
</style>
</head>
<body>

<h1>${tema.nombre}</h1>
`;

    // Recorrer todos los subtemas del tema
    for (const sub of tema.subtemas) {

        html += `
        <div class="subtema">
            <h2>${sub.nombre}</h2>

            <h3>Introducción</h3>
            ${sub.contenidoGenerado || "<p>(Sin contenido)</p>"}

            <h3>Módulos</h3>
        `;

        // SI NO TIENE MODULOS
        if (!sub.modulosIds || sub.modulosIds.length === 0) {
            html += `<p>(Sin módulos)</p>`;
        } else {

            // 🔥 Cargar cada módulo desde Firebase
            for (const modId of sub.modulosIds) {

                const modulo = await obtenerModulo(modId);

                if (!modulo) {
                    html += `<p>(Módulo no encontrado)</p>`;
                    continue;
                }
                if (modulo.archivado) {
                    continue;
                }

                const contenidoLimpio = String(modulo.contenido || "<p>(Sin contenido)</p>")
                    .replace(/<div[^>]*class="[^"]*rounded-lg[^"]*bg-background[^"]*shadow-sm[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                    .replace(/<div[^>]*class="[^"]*rounded-lg[^"]*bg-muted\/40[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                    .replace(/<div[^>]*class="[^"]*text-xs[^"]*text-gray-500[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
                    .replace(/<p[^>]*>\s*M[oó]dulo analizado:[\s\S]*?<\/p>/gi, "")
                    .replace(/<label[^>]*class="[^"]*section-title[^"]*"[^>]*>[\s\S]*?<\/label>/gi, "")
                    .replace(/<h1[^>]*class="[^"]*font-semibold[^"]*text-slate-900[^"]*mt-3[^"]*mb-2[^"]*"[^>]*>([\s\S]*?)<\/h1>/gi, '<h2 class="word-titulo2">$1</h2>');

                html += `
                <div class="modulo">
                    <h3 class="modulo-nombre-word">${modulo.nombre || "Módulo sin nombre"}</h3>
                    ${contenidoLimpio || "<p>(Sin contenido)</p>"}
                </div>
                `;
            }
        }

        html += `</div>`;
    }

    html += `
</body>
</html>
`;

    // EXPORTAR A WORD
    try {
        const blob = window.htmlDocx.asBlob(html);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${tema.nombre}.docx`;
        a.click();
    } catch (e) {
        alert("Error exportando el tema a Word");
    }
}


/* ======================================================
   FUNCIONES PARA MANEJAR CONTENIDO ENRIQUECIDO EN MODAL GEMINI
====================================================== */

// Variable global para almacenar selección actual
let currentGeminiSelection = null;
let geminiToolbarInicializado = false;

function obtenerEditorGemini() {
    return document.getElementById('txtModalInstruccionesGemini');
}

function escapeHtmlGemini(texto = "") {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function contieneTablaEnHtml(html = "") {
    return /<table[\s\S]*?>[\s\S]*?<\/table>/i.test(html);
}

function esTextoTabular(texto = "") {
    if (!texto) return false;
    const lineas = texto
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    if (lineas.length < 1) return false;

    const conTab = lineas.filter(l => l.includes('\t'));
    if (conTab.length === 0) return false;
    if (lineas.length === 1) return conTab[0].split('\t').length > 1;

    // Al menos dos filas con dos columnas para tratarlo como tabla.
    return conTab.length >= 2 && conTab.every(l => l.split('\t').length > 1);
}

function convertirTextoTabularATablaHTML(texto = "") {
    const filas = texto
        .split(/\r?\n/)
        .map(f => f.trim())
        .filter(Boolean)
        .map(f => f.split('\t').map(c => escapeHtmlGemini(c.trim())));

    if (!filas.length) return "";
    if (filas.length === 1 && filas[0].length < 2) return "";

    const cabecera = filas[0];
    const cuerpo = filas.slice(1);

    const thead = `<thead><tr>${cabecera.map(c => `<th class="cb-editor-table-th">${c || "&nbsp;"}</th>`).join("")}</tr></thead>`;
    const tbodyFilas = (cuerpo.length ? cuerpo : [Array.from({ length: 1 }, () => "")])
        .map(f => `<tr>${f.map(c => `<td class="cb-editor-table-td">${c || "&nbsp;"}</td>`).join("")}</tr>`)
        .join("");

    return `<table class="cb-editor-table">${thead}<tbody>${tbodyFilas}</tbody></table>`;
}

function insertarHtmlEnEditorGemini(html = "") {
    if (!html) return;
    document.execCommand('insertHTML', false, html);
    guardarSeleccionGemini();
}

function fileToDataUrlGemini(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(file);
    });
}

function sanitizeAttrGemini(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function insertarImagenEnEditorGemini(dataUrl, nombre = "imagen") {
    const safeName = sanitizeAttrGemini(nombre);
    const html = `
        <figure class="cb-editor-image-wrap my-3">
            <img src="${dataUrl}" alt="${safeName}" class="max-w-full h-auto rounded border border-slate-200" />
            <figcaption class="text-xs text-muted-foreground mt-1">${safeName}</figcaption>
        </figure>
    `;
    insertarHtmlEnEditorGemini(html);
}

async function manejarCambioImagenGemini(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
        if (!file.type.startsWith("image/")) {
            alert("Selecciona un archivo de imagen válido.");
            return;
        }

        const maxMB = 4;
        if (file.size > maxMB * 1024 * 1024) {
            alert(`La imagen supera ${maxMB}MB. Usa una imagen más ligera.`);
            return;
        }

        const dataUrl = await fileToDataUrlGemini(file);
        if (!dataUrl.startsWith("data:image/")) {
            alert("No se pudo procesar la imagen.");
            return;
        }

        const editor = obtenerEditorGemini();
        if (!editor) return;
        editor.focus();
        restaurarSeleccionGemini();
        insertarImagenEnEditorGemini(dataUrl, file.name || "imagen");
        updateFormatInfo("Imagen insertada. Gemini la usará al generar.");
    } catch (error) {
        alert("No se pudo insertar la imagen.");
    } finally {
        if (input) input.value = "";
    }
}

function insertGeminiImage() {
    const input = document.getElementById("inputImagenGemini");
    const editor = obtenerEditorGemini();
    if (!input || !editor) return;
    editor.focus();
    guardarSeleccionGemini();
    input.click();
}

function guardarSeleccionGemini() {
    const editor = obtenerEditorGemini();
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    currentGeminiSelection = range.cloneRange();
}

function restaurarSeleccionGemini() {
    if (!currentGeminiSelection) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(currentGeminiSelection);
    return true;
}

function inicializarToolbarInstruccionesGemini() {
    if (geminiToolbarInicializado) return;

    const editor = obtenerEditorGemini();
    const toolbar = document.getElementById('toolbarInstruccionesGemini');
    const imageInput = document.getElementById('inputImagenGemini');
    if (!editor || !toolbar) return;

    // Mantener selección al pulsar botones del toolbar.
    toolbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });

    editor.addEventListener('mouseup', guardarSeleccionGemini);
    editor.addEventListener('keyup', guardarSeleccionGemini);
    editor.addEventListener('input', guardarSeleccionGemini);

    // Exponer handlers en window porque el HTML usa onclick inline.
    window.formatText = formatText;
    window.insertTable = insertTable;
    window.insertGeminiImage = insertGeminiImage;
    window.pasteAsPlainText = pasteAsPlainText;
    window.pasteWithFormat = pasteWithFormat;
    window.clearFormat = clearFormat;

    if (imageInput && imageInput.dataset.cbBound !== "1") {
        imageInput.addEventListener("change", manejarCambioImagenGemini);
        imageInput.dataset.cbBound = "1";
    }

    geminiToolbarInicializado = true;
}

// Función para formatear texto
function formatText(command) {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();

    // Aplicar formato
    document.execCommand(command, false, null);

    guardarSeleccionGemini();

    // Actualizar indicador
    updateFormatInfo(`Formato aplicado: ${command}`);
}

// Función para insertar una tabla básica
function insertTable() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();

    const tableHTML = `
        <table class="cb-editor-table">
            <thead>
                <tr>
                    <th class="cb-editor-table-th">Columna 1</th>
                    <th class="cb-editor-table-th">Columna 2</th>
                    <th class="cb-editor-table-th">Columna 3</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="cb-editor-table-td">Fila 1, Celda 1</td>
                    <td class="cb-editor-table-td">Fila 1, Celda 2</td>
                    <td class="cb-editor-table-td">Fila 1, Celda 3</td>
                </tr>
                <tr>
                    <td class="cb-editor-table-td">Fila 2, Celda 1</td>
                    <td class="cb-editor-table-td">Fila 2, Celda 2</td>
                    <td class="cb-editor-table-td">Fila 2, Celda 3</td>
                </tr>
            </tbody>
        </table>
    `;
    
    // Insertar tabla en la posición actual
    document.execCommand('insertHTML', false, tableHTML);
    guardarSeleccionGemini();
    
    // Actualizar indicador
    updateFormatInfo("Tabla insertada. Puedes editar su contenido.");
}

// Función para pegar como texto plano
function pasteAsPlainText() {
    const editor = obtenerEditorGemini();
    if (!editor) return;
    
    // Enfocar el editor
    editor.focus();
    restaurarSeleccionGemini();
    
    // Usar el comando paste (requiere permisos del navegador)
    try {
        document.execCommand('paste');
        guardarSeleccionGemini();
        updateFormatInfo("Texto pegado (sin formato)");
    } catch (e) {
        // Fallback: usar API de clipboard
        navigator.clipboard.readText().then(text => {
            document.execCommand('insertText', false, text);
            guardarSeleccionGemini();
            updateFormatInfo("Texto pegado (sin formato)");
        }).catch(err => {
            alert('No se pudo pegar el contenido. Por favor, usa Ctrl+V manualmente.');
        });
    }
}

// Función para pegar con formato HTML
async function pasteWithFormat() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();
    
    try {
        // Intentar obtener HTML del portapapeles
        const items = await navigator.clipboard.read();
        let htmlContent = null;
        
        for (const item of items) {
            if (item.types.includes('text/html')) {
                const blob = await item.getType('text/html');
                const text = await blob.text();
                htmlContent = text;
                break;
            }
        }
        
        if (htmlContent) {
            // Extraer solo el body si viene como HTML completo
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                htmlContent = bodyMatch[1];
            }
            
            // Limpiar scripts y estilos potencialmente peligrosos
            htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            htmlContent = htmlContent.replace(/on\w+="[^"]*"/gi, '');

            if (contieneTablaEnHtml(htmlContent)) {
                insertarHtmlEnEditorGemini(htmlContent);
                updateFormatInfo("Tabla pegada desde portapapeles");
            } else {
                // Insertar el HTML normal
                document.execCommand('insertHTML', false, htmlContent);
                guardarSeleccionGemini();
                updateFormatInfo("Contenido pegado con formato HTML");
            }
        } else {
            // Fallback a texto plano
            const text = await navigator.clipboard.readText();
            if (esTextoTabular(text)) {
                const tableHTML = convertirTextoTabularATablaHTML(text);
                if (tableHTML) {
                    insertarHtmlEnEditorGemini(tableHTML);
                    updateFormatInfo("Tabla convertida desde texto del portapapeles");
                    return;
                }
            }
            document.execCommand('insertText', false, text);
            guardarSeleccionGemini();
            updateFormatInfo("Texto pegado (sin formato HTML disponible)");
        }
    } catch (error) {
        pasteAsPlainText();
    }
}

// Función para limpiar formato
function clearFormat() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();
    document.execCommand('removeFormat', false, null);
    document.execCommand('unlink', false, null);
    guardarSeleccionGemini();
    updateFormatInfo("Formato limpiado");
}

// Función para actualizar información de formato
function updateFormatInfo(message) {
    const formatInfo = document.getElementById('formatInfo');
    const formatStatus = document.getElementById('formatStatus');
    
    if (formatInfo && formatStatus) {
        formatStatus.textContent = message;
        formatInfo.classList.remove('hidden');
        
        // Ocultar después de 3 segundos
        setTimeout(() => {
            formatInfo.classList.add('hidden');
        }, 3000);
    }
}

// Manejar el evento de pegado en el editor
document.addEventListener('DOMContentLoaded', function() {
    inicializarToolbarInstruccionesGemini();
    const editor = obtenerEditorGemini();
    
    if (editor) {
        // Manejar evento de pegado
        editor.addEventListener('paste', function(e) {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const html = clipboardData.getData('text/html') || "";
            const text = clipboardData.getData('text/plain') || "";

            // 1) Si viene tabla HTML, pegar tabla manteniendo formato.
            if (html && contieneTablaEnHtml(html)) {
                e.preventDefault();
                let htmlContent = html;
                const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) htmlContent = bodyMatch[1];
                htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                htmlContent = htmlContent.replace(/on\w+="[^"]*"/gi, '');
                insertarHtmlEnEditorGemini(htmlContent);
                updateFormatInfo("Tabla pegada desde portapapeles");
                return;
            }

            // 2) Si viene texto tabular (Excel/Sheets TSV), convertir a tabla.
            if (text && esTextoTabular(text)) {
                e.preventDefault();
                const tableHTML = convertirTextoTabularATablaHTML(text);
                if (tableHTML) {
                    insertarHtmlEnEditorGemini(tableHTML);
                    updateFormatInfo("Tabla convertida desde Excel/Sheets");
                    return;
                }
            }

            // 3) Comportamiento normal para otros casos.
            setTimeout(() => {
                updateFormatInfo("Contenido pegado");
            }, 100);
        });
        
        // Manejar placeholder
        editor.addEventListener('focus', function() {
            if (this.innerHTML === '<br>' || this.innerHTML.trim() === '') {
                this.innerHTML = '';
            }
        });
        
        editor.addEventListener('blur', function() {
            if (this.innerHTML === '' || this.innerHTML === '<br>') {
                this.innerHTML = '';
            }
        });
    }
});

// Modificar la función abrirInstruccionesGemini para manejar HTML
window.abrirInstruccionesGemini = async function(moduloId) {
    inicializarToolbarInstruccionesGemini();
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) return;

    // Guardamos referencia al ID, no el objeto
    window.__moduloEditandoInstruccionesId = moduloId;

    // Obtener el editor
    const editor = document.getElementById('txtModalInstruccionesGemini');
    if (!editor) {
        return;
    }

    // Cargar instrucciones (pueden contener HTML)
    if (modulo.instrucciones) {
        // Si contiene HTML, usarlo directamente
        if (modulo.instrucciones.includes('<') && modulo.instrucciones.includes('>')) {
            editor.innerHTML = modulo.instrucciones;
        } else {
            // Si es texto plano, convertirlo manteniendo saltos de línea
            const textWithBreaks = modulo.instrucciones.replace(/\n/g, '<br>');
            editor.innerHTML = textWithBreaks;
        }
    } else {
        editor.innerHTML = '';
    }

    // Mostrar modal
    document.getElementById("modalInstruccionesGemini").classList.remove("hidden");
    document.getElementById("modalInstruccionesGemini").classList.add("flex");
    
    // Enfocar el editor
    setTimeout(() => {
        editor.focus();
        guardarSeleccionGemini();
    }, 100);
};

function inicializarEventosModalInstruccionesGemini() {
    const btnCerrar = document.getElementById("btnCerrarInstruccionesGemini");
    const btnGuardar = document.getElementById("btnGuardarInstruccionesGemini");
    const modal = document.getElementById("modalInstruccionesGemini");
    if (!btnCerrar || !btnGuardar || !modal) return;
    if (btnGuardar.dataset.cbBound === "1") return;

    btnCerrar.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    });

    btnGuardar.addEventListener("click", async () => {
        const editor = obtenerEditorGemini();
        if (!editor) return;
        
        const contenidoHTML = editor.innerHTML.trim();
        const moduloId = window.__moduloEditandoInstruccionesId;

        if (!moduloId) return;

        // Guardar el HTML completo (puede contener tablas)
        await guardarModulo(moduloId, { instrucciones: contenidoHTML });

        // Cerrar modal
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        
        // Mostrar notificación
        const hasTable = contenidoHTML.includes('<table') || contenidoHTML.includes('<tr') || contenidoHTML.includes('<td');
        const message = hasTable ? 
            "✅ Instrucciones guardadas (incluyendo tablas)" : 
            "✅ Instrucciones guardadas";
        
        mostrarNotificacion(message, 'success');
    });

    btnGuardar.dataset.cbBound = "1";
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        inicializarToolbarInstruccionesGemini();
        inicializarEventosModalInstruccionesGemini();
    });
} else {
    inicializarToolbarInstruccionesGemini();
    inicializarEventosModalInstruccionesGemini();
}



// === GESTIÓN DE CACHE EN DEPLOY ===

const APP_VERSION = "2025.01.18-02"; // ⬅️ cambia en cada deploy

const storedVersion = localStorage.getItem("APP_VERSION");

if (storedVersion && storedVersion !== APP_VERSION) {
  localStorage.setItem("APP_VERSION", APP_VERSION);

  // Fuerza recarga real (equivalente a hard reload)
  window.location.reload(true);
} else {
  localStorage.setItem("APP_VERSION", APP_VERSION);
}
