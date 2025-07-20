import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, doc, 
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";


// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};



// Inicializa Firebase solo una vez
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);


// Ahora puedes usar Firebase Auth y otros servicios
const auth = getAuth(app);





onAuthStateChanged(auth, async user => {
  if (!user) return;
  // 1) recuperar rol desde Firestore
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  // 2) ocultar enlace Análisis Editorial si no está en la lista
  const analisisLink = document.getElementById("analisisEditorialLink");
  if (analisisLink) {
    const permitidos = ["admin","author","developer"];
    analisisLink.classList.toggle("d-none", !permitidos.includes(role));
  }
});


document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("menuToggle");

  const toggleSidebar = () => {
    sidebar.classList.toggle("show");

    if (sidebar.classList.contains("show")) {
      document.body.classList.remove("sidebar-collapsed");
    } else {
      document.body.classList.add("sidebar-collapsed");
    }
  };

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  // Sidebar colapsado por defecto
  sidebar.classList.remove("show");
  document.body.classList.add("sidebar-collapsed");

  // Navegación SPA con fallback offline
  document.querySelectorAll(".sidebar-link[data-page]").forEach(link => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const page = link.dataset.page;
  
      try {
        const res = await fetch(page);
        const html = await res.text();
  
        // Guarda en localStorage para navegación offline
        localStorage.setItem(`page:${page}`, html);
  
        // Si quieres cargar lógica JS específica:
        if (page === "unidadHome.html") {
          import("./unidadHome.js");
        } else if (page === "home.html") {
          import("./home.js");
        }
  
      } catch (error) {
        console.warn("❌ Error al cargar página:", page, error);
        // Cargar desde cache si está disponible
        const cached = localStorage.getItem(`page:${page}`);
        if (cached) {
          document.getElementById("app").innerHTML = cached;
        }
      }
    });
  });

  // Cerrar sesión
// Cerrar sesión y redirigir a index.html
const logoutLink = document.getElementById("logoutLink");
if (logoutLink) {
  logoutLink.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const auth = getAuth(); // Obtener instancia de auth
      await signOut(auth); // Cerrar sesión
      localStorage.clear(); // Limpiar todo el almacenamiento local

      // Redirigir a la página index.html dentro de la app Electron
      window.location.href = "index.html"; // Redirige a la página index.html de la app local
    } catch (err) {
      console.error("❌ Error al cerrar sesión:", err);
      alert("Error al cerrar sesión.");
    }
  });
}

});
