import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, doc, deleteDoc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';
import VanillaTilt from 'https://cdn.jsdelivr.net/npm/vanilla-tilt@1.7.3/lib/vanilla-tilt.es2015.min.js';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null;
let toggleVerArchivadosUnidades = false;

// Verificar el rol de usuario
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Obtener el rol del usuario de Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.role === "admin") {
        // Mostrar la sección de "Gestionar Usuarios" solo si el rol es admin
        document.getElementById('gestionUsuariosLink').style.display = 'block';
      } else {
        // Ocultar la sección si no es admin
        document.getElementById('gestionUsuariosLink').style.display = 'none';
      }
    }
  } else {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      // Modo offline, manejar el flujo sin conexión
    } else {
      // Redirigir a la página de inicio después de 1.5 segundos
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    }
  }
});



// Función para filtrar unidades basadas en la búsqueda
const filterUnidades = (query) => {
  const unidadItems = document.querySelectorAll(".unidad-item");

  if (!unidadItems.length) {
      return;
  }

  let hasMatches = false;
  const searchTerms = query.split(' ').filter(term => term.length > 0);

  unidadItems.forEach(item => {
      const text = item.textContent.toLowerCase();  // Obtiene el texto de la tarjeta

      const matches = searchTerms.length === 0 || 
                     searchTerms.some(term => text.includes(term));

      item.style.display = matches ? "block" : "none";
      if (matches) hasMatches = true;
  });

  // Manejar mensaje de no resultados
  const unidadesList = document.getElementById("unidades-list");
  const noResultsMsg = document.getElementById("no-results-msg");

  if (!hasMatches && query.length > 0) {
      if (!noResultsMsg && unidadesList) {
          const msg = document.createElement("p");
          msg.id = "no-results-msg";
          msg.textContent = "No se encontraron unidades que coincidan con la búsqueda.";
          unidadesList.appendChild(msg);
      }
  } else if (noResultsMsg) {
      noResultsMsg.remove();
  }
};


// Escuchar evento global de búsqueda
window.addEventListener("globalSearch", (e) => {
  loadUnidades(currentUserId, e.detail.query); // <--- Aquí usas currentUserId
});


// Función para obtener las unidades del usuario
const loadUnidades = async (userId, searchQuery = '') => {
  const unidadesList = document.getElementById("unidades-list");

  try {
    unidadesList.innerHTML = ""; // Limpiar antes de cargar

    let q = query(
      collection(db, "Unidades"),
      where("userId", "==", userId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      unidadesList.innerHTML = "<p>No tienes unidades creadas.</p>";
      return;
    }

    let unidades = [];

    querySnapshot.forEach((doc) => {
      let data = doc.data();
      data.id = doc.id;
      unidades.push(data);
    });

    unidades = unidades.filter(u => {
      return toggleVerArchivadosUnidades ? u.archivado === true : !u.archivado;
    });

    // Filtrado en el cliente (por texto libre)
    if (searchQuery.trim()) {
      const lowerSearch = searchQuery.toLowerCase();
      unidades = unidades.filter(unidad => {
        return (
          (unidad.grado && unidad.grado.toLowerCase().includes(lowerSearch)) ||
          (unidad.nivel && unidad.nivel.toLowerCase().includes(lowerSearch)) ||
          (unidad.trimestre && unidad.trimestre.toLowerCase().includes(lowerSearch)) ||
          (unidad.unidad && unidad.unidad.toLowerCase().includes(lowerSearch)) ||
          (unidad.privacidad && unidad.privacidad.toLowerCase().includes(lowerSearch))
        );
      });
    }

    if (unidades.length === 0) {
      unidadesList.innerHTML = "<p>No se encontraron unidades que coincidan con la búsqueda.</p>";
      return;
    }

    unidades.forEach((unidad) => {
      const unidadItem = document.createElement("div");
      unidadItem.classList.add("unidad-item", "searchable-item");
      unidadItem.setAttribute("id", `unidad-${unidad.id}`);
    
      unidadItem.innerHTML = `
        <div class="unidad-header">
          <h3>${unidad.materia} • ${unidad.nivel} ${unidad.grado} • Unidad ${unidad.unidad}</h3>
        </div>
        <div class="unidad-body">
          <p><strong>Nombre de la Unidad:</strong> ${unidad.nombreUnidad}</p>
          <p><strong>Trimestre:</strong> ${unidad.trimestre}</p>
          <p><strong>Privacidad:</strong> ${unidad.privacidad}</p>
          <p><strong>Fecha de creación:</strong> ${
            unidad.createdAt
              ? new Date(unidad.createdAt.seconds * 1000).toLocaleDateString()
              : "Sin fecha"
          }</p>
        </div>
        <div class="unidad-item-footer">
          <i class="bx bx-trash" title="Eliminar" onclick="event.stopPropagation(); eliminarUnidad('${unidad.id}')"></i>
          <i class="bx bx-archive archivar-unidad" title="${unidad.archivado ? 'Desarchivar' : 'Archivar'}" style="cursor: pointer; margin-left: 12px; color: ${unidad.archivado ? 'dodgerblue' : 'gray'};"></i>
        </div>
      `;
    
      // Archivar / Desarchivar
      unidadItem.querySelector(".archivar-unidad")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const nuevoEstado = !unidad.archivado;
    
        const confirmado = confirm(nuevoEstado ? "¿Archivar unidad?" : "¿Desarchivar unidad?");
        if (!confirmado) return;
    
        await updateDoc(doc(db, "Unidades", unidad.id), {
          archivado: nuevoEstado
        });
    
        if ((toggleVerArchivadosUnidades && !nuevoEstado) ||
            (!toggleVerArchivadosUnidades && nuevoEstado)) {
          document.getElementById(`unidad-${unidad.id}`)?.remove();
        } else {
          loadUnidades(currentUserId);
        }
      });
    
      // Navegar al hacer clic
      unidadItem.addEventListener("click", () => {
        window.location.href = `contenidoUnidad.html?unidadId=${unidad.id}&userId=${currentUserId}`;
      });
    
      unidadesList.appendChild(unidadItem);
      VanillaTilt.init(unidadItem, {
        max: 2,
        speed: 800,
        glare: true,
        "max-glare": 0.5
      });
    });
    
  } catch (error) {
  }
};

// Función para editar los datos de la unidad
function editarDatos(unidadId) {
  // Redirige a la página de edición con el id de la unidad
  window.location.href = `editarUnidad.html?id=${unidadId}`;
}

// Función para editar el contenido de la unidad
function editarContenido(unidadId) {
  // Redirige a la página de contenido con el id de la unidad
  window.location.href = `contenidoUnidad.html?id=${unidadId}`;
}

// Función para eliminar la unidad
async function eliminarUnidad(unidadId) {
  if (confirm("¿Estás seguro de que deseas eliminar esta unidad y todas las lecturas relacionadas?")) {
    try {
      // Eliminar las lecturas relacionadas con la unidad
      const lecturasQuery = query(
        collection(db, "lecturas"),
        where("unidadId", "==", unidadId)
      );
      const lecturasSnapshot = await getDocs(lecturasQuery);

      // Eliminar cada lectura asociada a la unidad
      lecturasSnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });

      // Eliminar la unidad de Firestore
      await deleteDoc(doc(db, "Unidades", unidadId));

      // Eliminar la unidad de la interfaz
      const unidadElement = document.getElementById(`unidad-${unidadId}`);
      if (unidadElement) {
        unidadElement.remove();
      }

      alert("Unidad y todas sus lecturas eliminadas correctamente.");
    } catch (error) {
      alert("Hubo un error al eliminar la unidad y las lecturas.");
    }
  }
}


window.eliminarUnidad = eliminarUnidad;


// Ejecutar cuando se cargue la página
document.addEventListener("DOMContentLoaded", () => {
  // Observar cambios de autenticación
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUserId = user.uid;
      loadUnidades(currentUserId);
    } else {
      window.location.href = "login.html";
    }
  });
  
  configurarBuscador();


    // Botón Crear Unidad
    const createUnidadBtn = document.getElementById("createUnidadBtn");
    if (createUnidadBtn) {
        createUnidadBtn.addEventListener("click", () => {
            window.location.href = "crearUnidades.html";
        });
    }

 
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggleArchivadosUnidadesBtn";
    toggleBtn.innerHTML = "<i class='bx bx-box'></i> Mostrar archivados";
    toggleBtn.classList.add("btn", "btn-secondary");
    toggleBtn.style.margin = "1rem";

    document.querySelector("#app-container-unidadHome").prepend(toggleBtn);

    toggleBtn.addEventListener("click", () => {
      toggleVerArchivadosUnidades = !toggleVerArchivadosUnidades;
      toggleBtn.innerHTML = toggleVerArchivadosUnidades
        ? "<i class='bx bx-box'></i> Ocultar archivados"
        : "<i class='bx bx-box'></i> Mostrar archivados";

      loadUnidades(currentUserId);
    });


});


function hacerArrastrable(elemento) {
  let offsetX = 0, offsetY = 0, startX = 0, startY = 0;
  let activo = false;

  // Eventos para mouse
  elemento.addEventListener('mousedown', iniciarArrastre);
  document.addEventListener('mousemove', moverElemento);
  document.addEventListener('mouseup', finalizarArrastre);

  // Eventos para táctil
  elemento.addEventListener('touchstart', iniciarArrastre);
  document.addEventListener('touchmove', moverElemento);
  document.addEventListener('touchend', finalizarArrastre);

  function iniciarArrastre(e) {
    activo = true;
    const evento = e.touches ? e.touches[0] : e;
    startX = evento.clientX;
    startY = evento.clientY;

    const rect = elemento.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    elemento.style.cursor = "grabbing";
    e.preventDefault();
  }

  function moverElemento(e) {
    if (!activo) return;
    const evento = e.touches ? e.touches[0] : e;

    let x = evento.clientX - offsetX;
    let y = evento.clientY - offsetY;

    // Limitar dentro de la ventana
    const maxX = window.innerWidth - elemento.offsetWidth;
    const maxY = window.innerHeight - elemento.offsetHeight;

    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    elemento.style.left = x + 'px';
    elemento.style.top = y + 'px';
  }

  function finalizarArrastre() {
    activo = false;
    elemento.style.cursor = "grab";
  }
}

// Activar arrastre para tu burbuja
document.addEventListener('DOMContentLoaded', () => {
  const bubble = document.getElementById('chatbotBubble');
  hacerArrastrable(bubble);
});


const configurarBuscador = () => {
  const input = document.getElementById("searchInput");
  const filtroNivel = document.getElementById("filtroNivel");
  const filtroGrado = document.getElementById("filtroGrado");
  const filtroTrimestre = document.getElementById("filtroTrimestre");
  const filtroUnidad = document.getElementById("filtroUnidad");

  const contenedor = document.getElementById("unidades-list");

  const aplicarFiltros = () => {
    const texto = input?.value.toLowerCase().trim() || "";
    const nivel = filtroNivel?.value.toLowerCase() || "";
    const grado = filtroGrado?.value.toLowerCase() || "";
    const trimestre = filtroTrimestre?.value.toLowerCase() || "";
    const unidad = filtroUnidad?.value.toLowerCase() || "";

    const tarjetas = document.querySelectorAll(".unidad-item");
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
  


