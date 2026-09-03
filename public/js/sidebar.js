let app = null;
let auth = null;
let sidebarAuthPromise = null;
let firestorePromise = null;
let sidebarUser = null;
const loadSidebarFirestore = () => firestorePromise ||= import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");

async function loadSidebarAuth() {
  sidebarAuthPromise ||= Promise.all([
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js"),
    import("./firebase-default-app.js")
  ]).then(([authApi, { getDefaultFirebaseApp }]) => {
    app = getDefaultFirebaseApp();
    auth = authApi.getAuth(app);
    return { ...authApi, auth };
  });
  return sidebarAuthPromise;
}

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

async function startSidebarUnreadListener(uid) {
  if (typeof unsubscribeSidebarUnread === "function") {
    unsubscribeSidebarUnread();
    unsubscribeSidebarUnread = null;
  }
  if (!uid) {
    updateChatBadge(0);
    return;
  }

  const { getFirestore, collectionGroup, query, where, onSnapshot } = await loadSidebarFirestore();
  const db = getFirestore(app);
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

function applySidebarRoleVisibility(role = "") {
  const normalizedRole = canonicalRole(role);
  if (document.body) {
    document.body.setAttribute("data-user-role", normalizedRole || "");
  }
  const roleLinks = document.querySelectorAll("#sidebar .sidebar-link[data-role-visibility]");
  roleLinks.forEach((link) => {
    const allowed = String(link.dataset.roleVisibility || "")
      .split(",")
      .map((v) => canonicalRole(v))
      .filter(Boolean);
    const isVisible = allowed.length > 0 && allowed.includes(normalizedRole);
    link.classList.toggle("d-none", !isVisible);
    link.hidden = !isVisible;
    if (!isVisible) {
      link.setAttribute("aria-hidden", "true");
      link.setAttribute("tabindex", "-1");
    } else {
      link.setAttribute("aria-hidden", "false");
      link.removeAttribute("tabindex");
    }
  });

  // Hard guard por enlace para que cada opción respete su rol real.
  const roleLockedIds = {
    gestionUsuariosLink: ["admin"]
  };
  Object.entries(roleLockedIds).forEach(([id, allowedRoles]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const roleList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const isVisible = roleList.includes(normalizedRole);
    el.classList.toggle("d-none", !isVisible);
    el.hidden = !isVisible;
    if (!isVisible) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("tabindex", "-1");
    } else {
      el.style.display = "";
      el.setAttribute("aria-hidden", "false");
      el.removeAttribute("tabindex");
    }
  });
  updateSidebarGroupAvailability();
}

function applySidebarAuthVisibility(user = null) {
  const hasSession = Boolean(user);
  const authLinks = document.querySelectorAll("#sidebar .sidebar-link[data-auth-required]");
  authLinks.forEach((link) => {
    link.classList.toggle("d-none", !hasSession);
    link.hidden = !hasSession;
    if (!hasSession) {
      link.setAttribute("aria-hidden", "true");
      link.setAttribute("tabindex", "-1");
    } else {
      link.setAttribute("aria-hidden", "false");
      link.removeAttribute("tabindex");
    }
  });
  updateSidebarGroupAvailability();
}

function updateSidebarGroupAvailability() {
  document.querySelectorAll("#sidebar .sidebar-group").forEach((group) => {
    const hasVisibleLinks = Array.from(group.querySelectorAll(".sidebar-group-link"))
      .some((link) => !link.hidden && !link.classList.contains("d-none") && link.style.display !== "none");
    group.hidden = !hasVisibleLinks;
  });
}

function setSidebarGroupExpanded(group, expanded) {
  if (!group) return;
  const button = group.querySelector(":scope > .sidebar-group-toggle");
  const panel = group.querySelector(":scope > .sidebar-group-items");
  if (!button || !panel) return;
  group.classList.toggle("is-expanded", expanded);
  button.setAttribute("aria-expanded", String(expanded));
  panel.hidden = !expanded;
}

function initializeSidebarGroups(sidebar) {
  const groups = Array.from(sidebar.querySelectorAll(".sidebar-group"));
  groups.forEach((group) => {
    const button = group.querySelector(":scope > .sidebar-group-toggle");
    if (!button || button.dataset.sidebarGroupBound === "true") return;
    button.dataset.sidebarGroupBound = "true";
    button.addEventListener("click", () => {
      const wasExpanded = button.getAttribute("aria-expanded") === "true";
      const sidebarWasCollapsed = !sidebar.classList.contains("show");
      if (!sidebarWasCollapsed && wasExpanded) {
        groups.forEach((candidate) => setSidebarGroupExpanded(candidate, false));
        sidebar.classList.remove("show");
        document.body.classList.add("sidebar-collapsed");
        return;
      }
      if (sidebarWasCollapsed) {
        sidebar.classList.add("show");
        document.body.classList.remove("sidebar-collapsed");
      }
      const shouldExpand = sidebarWasCollapsed || !wasExpanded;
      groups.forEach((candidate) => setSidebarGroupExpanded(candidate, candidate === group && shouldExpand));
    });
  });

  const activeLink = sidebar.querySelector(".sidebar-link[aria-current='page']");
  const activeGroup = activeLink?.closest(".sidebar-group") || null;
  if (activeGroup) {
    groups.forEach((group) => setSidebarGroupExpanded(group, group === activeGroup));
  }
  updateSidebarGroupAvailability();
}

function normalizeSidebarLinkTargets(sidebar) {
  sidebar.querySelectorAll("a[href]").forEach((link) => {
    const href = String(link.getAttribute("href") || "").trim();
    if (!href || href === "#" || href.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(href)) return;
    link.setAttribute("href", `/${href.replace(/^\.\//, "")}`);
  });
}

function initializeSidebarResizer(sidebar) {
  const minWidth = 200;
  const maxWidth = 420;
  const defaultWidth = 250;
  const storageKey = "cb_sidebar_expanded_width";
  const clampWidth = (value) => Math.min(maxWidth, Math.max(minWidth, Number(value) || defaultWidth));
  const applyWidth = (value, persist = false) => {
    const width = clampWidth(value);
    document.documentElement.style.setProperty("--cb-sidebar-expanded-width", `${width}px`);
    resizer.setAttribute("aria-valuenow", String(Math.round(width)));
    if (persist) {
      try { localStorage.setItem(storageKey, String(Math.round(width))); } catch (_) {}
    }
    return width;
  };

  let savedWidth = defaultWidth;
  try { savedWidth = clampWidth(localStorage.getItem(storageKey)); } catch (_) {}

  const existing = sidebar.querySelector(":scope > .sidebar-resizer");
  const resizer = existing || document.createElement("div");
  resizer.className = "sidebar-resizer";
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", "Redimensionar menú lateral");
  resizer.setAttribute("aria-valuemin", String(minWidth));
  resizer.setAttribute("aria-valuemax", String(maxWidth));
  resizer.setAttribute("tabindex", "0");
  resizer.title = "Arrastra para redimensionar. Doble clic para restaurar.";
  if (!existing) sidebar.appendChild(resizer);
  applyWidth(savedWidth);

  let startX = 0;
  let startWidth = savedWidth;
  const finishResize = (event) => {
    if (!resizer.hasPointerCapture?.(event.pointerId)) return;
    resizer.releasePointerCapture(event.pointerId);
    document.body.classList.remove("sidebar-resizing");
    applyWidth(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cb-sidebar-expanded-width")), true);
  };

  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!sidebar.classList.contains("show")) {
      sidebar.classList.add("show");
      document.body.classList.remove("sidebar-collapsed");
    }
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("sidebar-resizing");
  });

  resizer.addEventListener("pointermove", (event) => {
    if (!resizer.hasPointerCapture?.(event.pointerId)) return;
    applyWidth(startWidth + event.clientX - startX);
  });
  resizer.addEventListener("pointerup", finishResize);
  resizer.addEventListener("pointercancel", finishResize);
  resizer.addEventListener("dblclick", () => applyWidth(defaultWidth, true));
  resizer.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cb-sidebar-expanded-width")) || defaultWidth;
    const next = event.key === "Home" ? defaultWidth : current + (event.key === "ArrowRight" ? 10 : -10);
    applyWidth(next, true);
  });
}

function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function canonicalRole(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["superadmin", "superadministrator", "owner"].includes(token)) return "superAdmin";
  if (["admin", "administrador", "administrator"].includes(token)) return "admin";
  if (["author", "autor", "autoria"].includes(token)) return "author";
  if (["editor", "editorial"].includes(token)) return "editor";
  if (["designer", "disenador", "diseno"].includes(token)) return "designer";
  if (["developer", "desarrollador", "desarrollo", "dev"].includes(token)) return "developer";
  if (["pending", "pendiente"].includes(token)) return "pending";
  return token;
}

function extractUserRole(data = {}) {
  if (data?.superAdmin === true || data?.superadmin === true) return "superAdmin";
  if (data?.admin === true) return "admin";
  return canonicalRole(
    data.role
    || data.rol
    || data.userRole
    || data.user_role
    || data.userType
    || data.tipoUsuario
    || data.requestedRole
  ) || null;
}

async function resolveUserRole(user) {
  if (!user?.uid) return null;
  const { getFirestore, collection, query, where, getDocs, doc, getDoc } = await loadSidebarFirestore();
  const db = getFirestore(app);

  // 1) Ruta estándar users/{uid}
  const direct = await getDoc(doc(db, "users", user.uid));
  if (direct.exists()) {
    const data = direct.data() || {};
    return extractUserRole(data);
  }

  // 2) Compatibilidad por campo uid
  const byUid = await getDocs(query(collection(db, "users"), where("uid", "==", user.uid)));
  if (!byUid.empty) {
    const data = byUid.docs[0].data() || {};
    return extractUserRole(data);
  }

  // 3) Compatibilidad por email
  const email = String(user.email || "").trim();
  if (email) {
    const byEmail = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (!byEmail.empty) {
      const data = byEmail.docs[0].data() || {};
      return extractUserRole(data);
    }
    const byEmailLower = await getDocs(query(collection(db, "users"), where("email", "==", email.toLowerCase())));
    if (!byEmailLower.empty) {
      const data = byEmailLower.docs[0].data() || {};
      return extractUserRole(data);
    }
  }

  return null;
}

async function resolveRoleFromToken(user) {
  if (!user?.getIdTokenResult) return null;
  try {
    const tokenResult = await user.getIdTokenResult();
    return extractUserRole(tokenResult?.claims || {});
  } catch (_) {
    return null;
  }
}

function deferSidebarDataWork(callback) {
  const isScienceActivities = /(?:^|\/)scienceActivities(?:\.html)?$/i.test(location.pathname);
  if (!isScienceActivities) {
    void callback();
    return;
  }
  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    document.removeEventListener("scienceactivities:interactive", run);
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void callback(), { timeout: 1500 });
    else setTimeout(() => void callback(), 0);
  };
  if (document.documentElement.dataset.scienceActivitiesInteractive === "true") run();
  else {
    document.addEventListener("scienceactivities:interactive", run, { once: true });
    setTimeout(run, 2500);
  }
}

function deferScienceStartupWork(callback) {
  const isScienceActivities = /(?:^|\/)scienceActivities(?:\.html)?$/i.test(location.pathname);
  if (!isScienceActivities) {
    void callback();
    return;
  }
  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    document.removeEventListener("scienceactivities:interactive", run);
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void callback(), { timeout: 1500 });
    else setTimeout(() => void callback(), 0);
  };
  if (document.documentElement.dataset.scienceActivitiesInteractive === "true") run();
  else document.addEventListener("scienceactivities:interactive", run, { once: true });
}

async function initializeSidebarAuth() {
  const { onAuthStateChanged } = await loadSidebarAuth();
  setHeaderUserEmail(auth.currentUser?.email || "");
  onAuthStateChanged(auth, user => {
    sidebarUser = user;
    applySidebarAuthVisibility(user);
    if (!user) {
      if (typeof unsubscribeSidebarUnread === "function") unsubscribeSidebarUnread();
      unsubscribeSidebarUnread = null;
      updateChatBadge(0);
      setHeaderUserEmail("");
      applySidebarRoleVisibility("");
      applySidebarAuthVisibility(null);
      return;
    }
    setHeaderUserEmail(user.email || "");
    deferSidebarDataWork(async () => {
      let role = await resolveRoleFromToken(user);
      if (!role) {
        try { role = await resolveUserRole(user); } catch (_) { role = null; }
      }
      applySidebarRoleVisibility(role);
      const analisisLink = document.getElementById("analisisEditorialLink");
      if (analisisLink && !analisisLink.dataset.roleVisibility) {
        const permitidos = ["admin","author","editor","developer"];
        analisisLink.classList.toggle("d-none", !permitidos.includes(canonicalRole(role)));
      }
      const gestionUsuariosLink = document.getElementById("gestionUsuariosLink");
      if (gestionUsuariosLink && !gestionUsuariosLink.dataset.roleVisibility) gestionUsuariosLink.classList.toggle("d-none", canonicalRole(role) !== "admin");
      await startSidebarUnreadListener(user.uid);
    });
  });
}

function initSidebar() {
  const menu = document.querySelector("#sidebar .sidebar-menu");
  if (menu && !menu.children.length && !window.__cbSidebarWaitingForLayout) {
    window.__cbSidebarWaitingForLayout = true;
    const retry = () => {
      window.__cbSidebarWaitingForLayout = false;
      initSidebar();
    };
    document.addEventListener("charlylayout:ready", retry, { once: true });
    setTimeout(retry, 1000);
    return;
  }
  if (window.__cbSidebarInitialized) return;
  window.__cbSidebarInitialized = true;
  setHeaderUserEmail("");
  applySidebarRoleVisibility("");
  applySidebarAuthVisibility(sidebarUser);
  deferScienceStartupWork(() => initializeSidebarAuth().catch((error) => {
    console.warn("[sidebar] No fue posible inicializar autenticación:", error);
  }));

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  normalizeSidebarLinkTargets(sidebar);
  initializeSidebarGroups(sidebar);
  initializeSidebarResizer(sidebar);

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
  const logoutLink = document.getElementById("logoutLink");
  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const authApi = await loadSidebarAuth();
        await authApi.signOut(authApi.auth);
        localStorage.clear(); // Limpiar todo el almacenamiento local
        window.location.href = "index.html";
      } catch (err) {
        alert("Error al cerrar sesión.");
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar, { once: true });
} else {
  initSidebar();
}
