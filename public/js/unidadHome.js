import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, doc, deleteDoc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import VanillaTilt from './vendor/vanilla-tilt/vanilla-tilt.es2015.js';
import { escapeHtml } from './security-utils.js?v=2026-1.0.0.59';
import { getDefaultFirebaseApp } from './firebase-default-app.js';

const app = getDefaultFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null;
let toggleVerArchivadosUnidades = false;

function createInfoParagraph(label, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  p.appendChild(strong);
  p.append(` ${value}`);
  return p;
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    
      // Logic moved to sidebar.js
  } else {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    }
  }
});

window.addEventListener("globalSearch", (e) => {
  loadUnidades(currentUserId, e.detail.query);
});


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
      const header = document.createElement("div");
      header.className = "unidad-header";
      const title = document.createElement("h3");
      title.textContent = `${unidad.materia || ""} • ${unidad.nivel || ""} ${unidad.grado || ""} • Unidad ${unidad.unidad || ""}`.trim();
      header.appendChild(title);

      const body = document.createElement("div");
      body.className = "unidad-body";
      body.appendChild(createInfoParagraph("Nombre de la Unidad", unidad.nombreUnidad || "Sin nombre"));
      body.appendChild(createInfoParagraph("Trimestre", unidad.trimestre || "Sin trimestre"));
      body.appendChild(createInfoParagraph("Privacidad", unidad.privacidad || "Sin definir"));
      body.appendChild(createInfoParagraph(
        "Fecha de creación",
        unidad.createdAt ? new Date(unidad.createdAt.seconds * 1000).toLocaleDateString() : "Sin fecha"
      ));

      const footer = document.createElement("div");
      footer.className = "unidad-item-footer";

      const deleteIcon = document.createElement("i");
      deleteIcon.className = "bx bx-trash";
      deleteIcon.title = "Eliminar";
      deleteIcon.setAttribute("role", "button");
      deleteIcon.setAttribute("tabindex", "0");
      deleteIcon.setAttribute("aria-label", `Eliminar unidad ${escapeHtml(unidad.nombreUnidad || unidad.id)}`);

      const archiveIcon = document.createElement("i");
      archiveIcon.className = "bx bx-archive archivar-unidad";
      archiveIcon.title = unidad.archivado ? "Desarchivar" : "Archivar";
      archiveIcon.style.cursor = "pointer";
      archiveIcon.style.marginLeft = "12px";
      archiveIcon.style.color = unidad.archivado ? "dodgerblue" : "gray";

      footer.append(deleteIcon, archiveIcon);
      unidadItem.append(header, body, footer);

      deleteIcon.addEventListener("click", async (event) => {
        event.stopPropagation();
        await eliminarUnidad(unidad.id);
      });

      deleteIcon.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        await eliminarUnidad(unidad.id);
      });
    
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

async function eliminarUnidad(unidadId) {
  if (confirm("¿Estás seguro de que deseas eliminar esta unidad y todas las lecturas relacionadas?")) {
    try {
      const lecturasQuery = query(
        collection(db, "lecturas"),
        where("unidadId", "==", unidadId)
      );
      const lecturasSnapshot = await getDocs(lecturasQuery);

      lecturasSnapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });

      await deleteDoc(doc(db, "Unidades", unidadId));

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
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUserId = user.uid;
      loadUnidades(currentUserId);
    } else {
      window.location.href = "login.html";
    }
  });
  
  configurarBuscador();

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
  
