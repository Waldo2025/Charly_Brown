import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import {
  getFirestore, collection, collectionGroup, query, where, getDocs, doc, 
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";


// Configuración de Firebase
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
};



// Inicializa Firebase solo una vez
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);


// Ahora puedes usar Firebase Auth y otros servicios
const auth = getAuth(app);

let unsubscribeSidebarUnread = null;

function setHeaderUserEmail(email = "") {
  const el = document.getElementById("headerUserEmail");
  if (!el) return;
  const safe = String(email || "").trim();
  el.textContent = safe || "Sin sesión";
  el.setAttribute("title", safe || "Usuario autenticado");
}

function getChatBadgeEl() {
  const chatLink = document.getElementById("chatLink");
  if (!chatLink) return null;
  let badge = document.getElementById("chat-notification-badge");
  if (!badge) {
    badge = document.createElement("em");
    badge.id = "chat-notification-badge";
    badge.className = "sidebar-badge";
    badge.hidden = true;
    badge.textContent = "0";
    chatLink.appendChild(badge);
  }
  return badge;
}

function updateChatBadge(totalUnread) {
  const badge = getChatBadgeEl();
  if (!badge) return;
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.hidden = false;
    badge.classList.add("is-visible");
    return;
  }
  badge.textContent = "0";
  badge.hidden = true;
  badge.classList.remove("is-visible");
}

function getConversationId(user1, user2) {
  return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
}

function getLastReadTs(uid, conversationId) {
  const raw = localStorage.getItem(`chat_last_read:${uid}:${conversationId}`);
  const ts = Number(raw || 0);
  return Number.isFinite(ts) ? ts : 0;
}

function getMessageTs(message) {
  try {
    if (message?.timestamp?.toMillis) return message.timestamp.toMillis();
    if (message?.timestamp?.seconds) return Number(message.timestamp.seconds) * 1000;
    const n = Number(message?.timestamp || 0);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function startSidebarUnreadListener(uid) {
  if (typeof unsubscribeSidebarUnread === "function") {
    unsubscribeSidebarUnread();
    unsubscribeSidebarUnread = null;
  }
  if (!uid) {
    updateChatBadge(0);
    return;
  }

  const qUnread = query(
    collectionGroup(db, "chat"),
    where("receiverId", "==", uid)
  );

  unsubscribeSidebarUnread = onSnapshot(
    qUnread,
    (snapshot) => {
      let total = 0;
      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        if (!msg || msg.senderId === uid || msg.receiverId !== uid) return;
        const otherUid = msg.senderId;
        if (!otherUid) return;
        const convId = getConversationId(uid, otherUid);
        const lastRead = getLastReadTs(uid, convId);
        const msgTs = getMessageTs(msg);
        if (msgTs > lastRead) total += 1;
      });
      updateChatBadge(total);
    },
    () => {
      // Si falla por reglas/indice, ocultar badge y no romper sidebar.
      updateChatBadge(0);
    }
  );
}





onAuthStateChanged(auth, async user => {
  if (!user) {
    if (typeof unsubscribeSidebarUnread === "function") unsubscribeSidebarUnread();
    unsubscribeSidebarUnread = null;
    updateChatBadge(0);
    setHeaderUserEmail("");
    return;
  }
  setHeaderUserEmail(user.email || "");
  // 1) recuperar rol desde Firestore
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  // 2) ocultar enlace Análisis Editorial si no está en la lista
  const analisisLink = document.getElementById("analisisEditorialLink");
  if (analisisLink) {
    const permitidos = ["admin","author","developer"];
    analisisLink.classList.toggle("d-none", !permitidos.includes(role));
  }

  startSidebarUnreadListener(user.uid);
});


document.addEventListener("DOMContentLoaded", () => {
  setHeaderUserEmail(auth.currentUser?.email || "");
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("menuToggle");
  if (!sidebar) return;

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
      alert("Error al cerrar sesión.");
    }
  });
}

});
