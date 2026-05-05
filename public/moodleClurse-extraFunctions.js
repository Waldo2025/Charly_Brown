import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
// Firebase imports
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
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
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

import {
    getAuth,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

import { guardarModulo } from './moodleCourse.js?v=2026-1.0.1.14';
import { obtenerModulo } from './moodleCourse.js?v=2026-1.0.1.14';
import { sanitizeRichText } from './security-utils.js';

/* CONFIGURACIÓN FIREBASE */
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);



/* ============================================================
   ACTIVAR/DESACTIVAR EDICIÓN DE MÓDULO COMPLETO
============================================================ */

let moduloEditandoCompleto = null;
window.cursoCompartiendo = null;



function activarEdicionModuloCompleto(moduloId) {
    if (moduloEditandoCompleto && moduloEditandoCompleto !== moduloId) {
        desactivarEdicionModuloCompleto();
    }

    const contenedor = document.getElementById(`contenido-${moduloId}`);
    if (!contenedor) return;

    contenedor.contentEditable = "true";
    contenedor.focus();
    
    contenedor.classList.add("modulo-editando");
    contenedor.style.border = "2px solid #3b82f6";
    contenedor.style.background = "#f0f9ff";
    contenedor.style.padding = "12px";
    contenedor.style.minHeight = "100px";
    
    moduloEditandoCompleto = moduloId;

    configurarAutoguardadoModulo(contenedor, moduloId);
}

function desactivarEdicionModuloCompleto() {
    if (!moduloEditandoCompleto) return;
    
    const contenedor = document.getElementById(`contenido-${moduloEditandoCompleto}`);
    if (!contenedor) return;

    contenedor.contentEditable = "false";
    
    contenedor.classList.remove("modulo-editando");
    contenedor.style.border = "";
    contenedor.style.background = "";
    contenedor.style.padding = "";
    
    guardarContenidoModulo(moduloEditandoCompleto, sanitizeRichText(contenedor.innerHTML));
    
    moduloEditandoCompleto = null;
}

function configurarAutoguardadoModulo(contenedor, moduloId) {
    let timeoutId;
    let contenidoAnterior = sanitizeRichText(contenedor.innerHTML);

    contenedor.addEventListener("blur", () => {
        const sanitized = sanitizeRichText(contenedor.innerHTML);
        if (sanitized !== contenidoAnterior) {
            guardarContenidoModulo(moduloId, sanitized);
            contenidoAnterior = sanitized;
        }
    });

    contenedor.addEventListener("input", () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            const sanitized = sanitizeRichText(contenedor.innerHTML);
            guardarContenidoModulo(moduloId, sanitized);
            contenidoAnterior = sanitized;
        }, 1000); // Reducido a 1s para mayor seguridad
    });

    contenedor.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            const sanitized = sanitizeRichText(contenedor.innerHTML);
            guardarContenidoModulo(moduloId, sanitized);
            contenidoAnterior = sanitized;
            
            mostrarFeedbackGuardado(moduloId);
        }
    });
}

async function guardarContenidoModulo(moduloId, contenido) {
    try {
        if (window.updateGlobalSaveStatus) window.updateGlobalSaveStatus(true);
        const { guardarModulo } = await import('./moodleCourse.js?v=2026-1.0.1.14');
        await guardarModulo(moduloId, { contenido: contenido });
        
        mostrarFeedbackGuardado(moduloId);
        
        return true;
    } catch (error) {
        mostrarErrorGuardado(moduloId);
        return false;
    } finally {
        if (window.updateGlobalSaveStatus) window.updateGlobalSaveStatus(false);
    }
}

function mostrarFeedbackGuardado(moduloId) {
    const spinner = document.getElementById(`spinner-${moduloId}`);
    if (spinner) {
        spinner.classList.remove("hidden");
        spinner.replaceChildren();
        const label = document.createElement("span");
        label.className = "text-green-600 text-xs";
        label.textContent = "✓ Guardado automáticamente";
        spinner.appendChild(label);
        
        setTimeout(() => {
            spinner.classList.add("hidden");
        }, 2000);
    }
}

function mostrarErrorGuardado(moduloId) {
    const spinner = document.getElementById(`spinner-${moduloId}`);
    if (spinner) {
        spinner.classList.remove("hidden");
        spinner.replaceChildren();
        const label = document.createElement("span");
        label.className = "text-red-600 text-xs";
        label.textContent = "✗ Error al guardar";
        spinner.appendChild(label);
        
        setTimeout(() => {
            spinner.classList.add("hidden");
        }, 3000);
    }
}





// Función para buscar usuario por email
async function buscarUsuarioPorEmail(email) {
    try {
        const q = query(
            collection(db, "users"),
            where("email", "==", email.toLowerCase().trim())
        );
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return null;
        }
        
        const userDoc = querySnapshot.docs[0];
        return {
            id: userDoc.id,
            ...userDoc.data()
        };
    } catch (error) {
        return null;
    }
}


// Función para compartir curso - VERSIÓN CORREGIDA CON MÓDULOS
async function compartirCursoConUsuario(emailDestino, permisos) {
    if (!window.cursoCompartiendo) {
        alert("Error: No hay curso seleccionado para compartir.");
        return false;
    }

    try {
        const usuarioDestino = await buscarUsuarioPorEmail(emailDestino);
        if (!usuarioDestino) {
            alert(`No se encontró ningún usuario con el email: ${emailDestino}`);
            return false;
        }

        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert("Debes iniciar sesión para compartir cursos.");
            return false;
        }

        if (usuarioDestino.id === currentUser.uid) {
            alert("No puedes compartir el curso contigo mismo.");
            return false;
        }

        const cursoOriginal = window.cursoCompartiendo;
        const nuevoCursoId = crypto.randomUUID();


        // 1️⃣ Crear copia profunda
        const cursoCopia = JSON.parse(JSON.stringify(cursoOriginal));

        cursoCopia.id = nuevoCursoId;
        cursoCopia.cursoId = nuevoCursoId;
        cursoCopia.userId = usuarioDestino.id;
        cursoCopia.nombre = cursoOriginal.nombre + " (Compartido)";
        cursoCopia.creado = new Date();
        cursoCopia.esCompartido = true;
        cursoCopia.originalId = cursoOriginal.id;
        cursoCopia.compartidoPor = {
            userId: currentUser.uid,
            email: currentUser.email,
            fecha: new Date(),
            permisos: permisos
        };

        // 2️⃣ Procesar temas, subtemas y módulos
        const modulosAGuardar = [];

        for (let tema of cursoCopia.temas) {
            tema.id = crypto.randomUUID();
            tema.subtemas = tema.subtemas || [];

            for (let subtema of tema.subtemas) {
                subtema.id = crypto.randomUUID();
                
                const nuevosModulosIds = [];
                
                if (subtema.modulosIds && subtema.modulosIds.length > 0) {
                    for (let modId of subtema.modulosIds) {
                        
                        const nuevoModId = crypto.randomUUID();
                        nuevosModulosIds.push(nuevoModId);

                        // 3️⃣ Obtener módulo original
                        const modSnap = await getDoc(doc(db, "moodleCourses", `${cursoOriginal.id}_${modId}`));
                        
                        if (modSnap.exists()) {
                            const modData = modSnap.data();
                            modData.id = nuevoModId;
                            modData.cursoId = nuevoCursoId;

                            // Guardar más tarde
                            modulosAGuardar.push({
                                id: nuevoModId,
                                data: modData
                            });

                        }
                    }
                }

                subtema.modulosIds = nuevosModulosIds;
            }
        }

        // 4️⃣ Guardar curso principal
        await setDoc(doc(db, "moodleCourses", nuevoCursoId), cursoCopia);

        // 5️⃣ Guardar todos los módulos
        for (let mod of modulosAGuardar) {
            await setDoc(doc(db, "moodleCourses", `${nuevoCursoId}_${mod.id}`), mod.data);
        }


        // 6️⃣ Cerrar modal
        document.getElementById("modalCompartirCurso").classList.add("hidden");
        window.cursoCompartiendo = null;

        alert(`✅ Curso "${cursoOriginal.nombre}" compartido correctamente con ${emailDestino}.`);

        return true;

    } catch (err) {
        alert("Error al compartir el curso: " + err.message);
        return false;
    }
}



async function verificarIntegridadCursoCompartido(cursoId) {
    try {
        const cursoRef = doc(db, "moodleCourses", cursoId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            return false;
        }
        
        const cursoData = cursoSnap.data();
        
        let totalModulos = 0;
        let modulosEncontrados = 0;
        
        if (cursoData.temas) {
            for (let tema of cursoData.temas) {
                if (tema.subtemas) {
                    for (let subtema of tema.subtemas) {
                        if (subtema.modulosIds) {
                            totalModulos += subtema.modulosIds.length;
                            
                            for (let modId of subtema.modulosIds) {
                                try {
                                    const modRef = doc(db, "moodleCourses", `${cursoId}_${modId}`);
                                    const modSnap = await getDoc(modRef);
                                    
                                    if (modSnap.exists()) {
                                        modulosEncontrados++;
                                    } else {
                                    }
                                } catch (error) {
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return modulosEncontrados === totalModulos;
        
    } catch (error) {
        return false;
    }
}

// Función para verificar curso compartido
async function verificarCursoCompartido(cursoId) {
    try {
        const cursoRef = doc(db, "moodleCourses", cursoId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            return;
        }
        
        const data = cursoSnap.data();
        
        // Verificar cada tema
        if (data.temas) {
            data.temas.forEach((tema, i) => {
                if (tema.subtemas) {
                    tema.subtemas.forEach((subtema, j) => {
                    });
                }
            });
        }
        
    } catch (error) {
    }
}

// Manejar el botón Confirmar compartir
document.getElementById("btnConfirmarCompartirCurso").onclick = async () => {
    const checks = document.querySelectorAll(".chk-usuario-compartir:checked");
    const seleccionados = Array.from(checks).map(cb => cb.value);

    if (seleccionados.length === 0) {
        alert("Selecciona al menos un usuario.");
        return;
    }

    for (let userId of seleccionados) {
        await compartirCursoConUsuarioId(userId);
    }

    alert("✅ Curso compartido correctamente.");
    document.getElementById("modalCompartirCurso").classList.add("hidden");
};


// Manejar el botón Cancelar
document.getElementById("btnCancelarCompartirCurso").onclick = () => {
    document.getElementById("modalCompartirCurso").classList.add("hidden");
    cursoCompartiendo = null; // Limpiar la variable
};


async function compartirCursoConUsuarioId(usuarioDestinoId) {
    const usuarioDestino = await getDoc(doc(db, "users", usuarioDestinoId));

    if (!usuarioDestino.exists()) return;

    return compartirCursoConUsuario(usuarioDestino.data().email, {
        puedeEditar: true,
        puedeCompartir: false
    });
}



// Función para guardar registro del compartido (opcional)
async function guardarRegistroCompartido(cursoId, usuarioDestinoId, permisos) {
    try {
        const registroId = crypto.randomUUID();
        const registro = {
            id: registroId,
            cursoId: cursoId,
            usuarioOrigenId: currentUserId,
            usuarioDestinoId: usuarioDestinoId,
            fecha: new Date(),
            permisos: permisos,
            tipo: "compartido"
        };
        
        await setDoc(doc(db, "compartidos", registroId), registro);
    } catch (error) {
        // No es crítico, podemos continuar
    }
}



// También podrías añadir un campo para cursos compartidos en el sidebar:
function agregarSeccionCursosCompartidos() {
    // Podrías modificar renderListaCursos para mostrar cursos compartidos de forma diferente
    // O crear una sección separada
}


// Exporta las funciones
export { 
    activarEdicionModuloCompleto,
    desactivarEdicionModuloCompleto,
    guardarContenidoModulo,
    mostrarFeedbackGuardado,
    mostrarErrorGuardado
};
