import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where, limit } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";
import { escapeHtml } from "./security-utils.js";

const app = getApps().length ? getApp() : initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
void bootstrapFirebaseAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);

const AREA_ROLE_MAP = Object.freeze({
  editorial: "editor",
  autoria: "author",
  diseno: "designer",
  desarrollo: "developer"
});

const ROLE_LABELS = Object.freeze({
  admin: "Administrador",
  author: "Author",
  editor: "Editor",
  designer: "Designer",
  developer: "Developer",
  pending: "Pendiente"
});

const AREA_LABELS = Object.freeze({
  editorial: "Editorial",
  autoria: "Autoría",
  diseno: "Diseño",
  desarrollo: "Desarrollo"
});

const STATUS_LABELS = Object.freeze({
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado"
});

const state = {
  currentAdmin: null,
  users: [],
  filteredUsers: [],
  roleModal: null
};

const els = {
  searchName: document.getElementById("searchName"),
  searchArea: document.getElementById("searchArea"),
  searchStatus: document.getElementById("searchStatus"),
  searchRole: document.getElementById("searchRole"),
  usersTableBody: document.getElementById("usersTableBody"),
  usersEmptyState: document.getElementById("usersEmptyState"),
  btnRefreshUsers: document.getElementById("btnRefreshUsers"),
  statTotalUsers: document.getElementById("statTotalUsers"),
  statPendingUsers: document.getElementById("statPendingUsers"),
  statApprovedUsers: document.getElementById("statApprovedUsers"),
  statRejectedUsers: document.getElementById("statRejectedUsers"),
  editRoleForm: document.getElementById("editRoleForm"),
  editUserId: document.getElementById("editUserId"),
  editRoleHint: document.getElementById("editRoleHint"),
  newRole: document.getElementById("newRole"),
  editRoleModalEl: document.getElementById("editRoleModal")
};

if (els.editRoleModalEl) {
  state.roleModal = new bootstrap.Modal(els.editRoleModalEl);
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeToken(value = "") {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function canonicalRole(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["admin", "administrador", "administrator", "superadmin", "owner"].includes(token)) return "admin";
  if (["author", "autor", "autoria"].includes(token)) return "author";
  if (["editor", "editorial"].includes(token)) return "editor";
  if (["designer", "disenador", "diseno"].includes(token)) return "designer";
  if (["developer", "desarrollador", "desarrollo", "dev"].includes(token)) return "developer";
  if (["pending", "pendiente"].includes(token)) return "pending";
  return token;
}

function canonicalStatus(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["approved", "aprobado", "active", "activo"].includes(token)) return "approved";
  if (["rejected", "rechazado", "denied", "denegado", "blocked", "bloqueado"].includes(token)) return "rejected";
  if (["pending", "pendiente", "review", "revision"].includes(token)) return "pending";
  return token;
}

function normalizeArea(area = "") {
  return normalizeText(area)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveRoleByArea(area = "") {
  return AREA_ROLE_MAP[normalizeArea(area)] || "";
}

function getApprovalStatus(data = {}) {
  const explicit = canonicalStatus(data.approvalStatus || data.status || data.estado || data.estadoAprobacion);
  if (explicit === "pending" || explicit === "approved" || explicit === "rejected") return explicit;
  const role = canonicalRole(data.role || data.rol || data.userRole);
  return role && role !== "pending" ? "approved" : "pending";
}

function roleLabel(role = "") {
  const normalized = canonicalRole(role);
  return ROLE_LABELS[normalized] || (normalized ? normalized : "Sin rol");
}

function areaLabel(area = "") {
  const normalized = normalizeArea(area);
  return AREA_LABELS[normalized] || (String(area || "").trim() || "Sin área");
}

function statusLabel(status = "") {
  const normalized = canonicalStatus(status);
  return STATUS_LABELS[normalized] || "Pendiente";
}

async function findUserProfileByAuthUser(user) {
  if (!user?.uid) return null;

  // 1) Caso esperado: documento users/{uid}
  const directSnap = await getDoc(doc(db, "users", user.uid));
  if (directSnap.exists()) {
    return { id: directSnap.id, data: directSnap.data() || {} };
  }

  // 2) Compatibilidad legacy: buscar por campo uid
  const byUidSnap = await getDocs(query(collection(db, "users"), where("uid", "==", user.uid), limit(1)));
  if (!byUidSnap.empty) {
    const d = byUidSnap.docs[0];
    return { id: d.id, data: d.data() || {} };
  }

  // 3) Compatibilidad legacy: buscar por email (exacto / lowercase)
  const email = String(user.email || "").trim();
  if (email) {
    const byEmailSnap = await getDocs(query(collection(db, "users"), where("email", "==", email), limit(1)));
    if (!byEmailSnap.empty) {
      const d = byEmailSnap.docs[0];
      return { id: d.id, data: d.data() || {} };
    }
    const byEmailLowerSnap = await getDocs(query(collection(db, "users"), where("email", "==", email.toLowerCase()), limit(1)));
    if (!byEmailLowerSnap.empty) {
      const d = byEmailLowerSnap.docs[0];
      return { id: d.id, data: d.data() || {} };
    }
  }

  // 4) Último fallback: barrido completo (colecciones pequeñas/medias)
  const allUsers = await getDocs(collection(db, "users"));
  const targetEmail = normalizeText(email);
  for (const d of allUsers.docs) {
    const data = d.data() || {};
    if (String(data.uid || "") === String(user.uid)) {
      return { id: d.id, data };
    }
    if (targetEmail && normalizeText(data.email || "") === targetEmail) {
      return { id: d.id, data };
    }
  }

  return null;
}

function mapUser(docSnap) {
  const data = docSnap.data() || {};
  const firstName = String(data.firstName || "").trim();
  const lastName = String(data.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim() || "Sin nombre";
  const areaRaw = String(data.area || data.departamento || "").trim();
  const areaNorm = normalizeArea(areaRaw);
  const requestedRole = canonicalRole(data.requestedRole || data.rolSolicitado) || resolveRoleByArea(areaRaw);
  const role = canonicalRole(data.role || data.rol || data.userRole) || (requestedRole ? "pending" : "");
  const approvalStatus = getApprovalStatus(data);
  return {
    id: docSnap.id,
    uid: String(data.uid || data.userId || docSnap.id || ""),
    firstName,
    lastName,
    fullName,
    email: String(data.email || "").trim(),
    area: areaRaw,
    areaNorm,
    requestedRole,
    role,
    approvalStatus,
    createdAt: String(data.createdAt || ""),
    updatedAt: String(data.updatedAt || "")
  };
}

function renderStats(users = []) {
  const total = users.length;
  const pending = users.filter((u) => u.approvalStatus === "pending").length;
  const approved = users.filter((u) => u.approvalStatus === "approved").length;
  const rejected = users.filter((u) => u.approvalStatus === "rejected").length;
  if (els.statTotalUsers) els.statTotalUsers.textContent = String(total);
  if (els.statPendingUsers) els.statPendingUsers.textContent = String(pending);
  if (els.statApprovedUsers) els.statApprovedUsers.textContent = String(approved);
  if (els.statRejectedUsers) els.statRejectedUsers.textContent = String(rejected);
}

function buildRowActions(user) {
  const isSelf = user.uid && state.currentAdmin?.uid && user.uid === state.currentAdmin.uid;
  const canApprove = !isSelf && user.approvalStatus !== "approved";
  const canReject = !isSelf && user.approvalStatus === "pending";
  const canDelete = !isSelf;

  return `
    <div class="users-actions">
      ${canApprove ? `
        <button type="button" class="users-action-btn is-approve" data-action="approve" data-id="${escapeHtml(user.id)}" title="Aprobar usuario" aria-label="Aprobar usuario">
          <i class="fas fa-check"></i>
        </button>` : ""
      }
      ${canReject ? `
        <button type="button" class="users-action-btn is-reject" data-action="reject" data-id="${escapeHtml(user.id)}" title="Rechazar usuario" aria-label="Rechazar usuario">
          <i class="fas fa-xmark"></i>
        </button>` : ""
      }
      <button type="button" class="users-action-btn is-role" data-action="edit-role" data-id="${escapeHtml(user.id)}" title="Editar rol" aria-label="Editar rol">
        <i class="fas fa-user-gear"></i>
      </button>
      ${canDelete ? `
        <button type="button" class="users-action-btn is-delete" data-action="delete" data-id="${escapeHtml(user.id)}" title="Eliminar usuario" aria-label="Eliminar usuario">
          <i class="fas fa-trash"></i>
        </button>` : ""
      }
    </div>
  `;
}

function renderUsersTable(users = []) {
  if (!els.usersTableBody) return;
  if (!users.length) {
    els.usersTableBody.innerHTML = "";
    els.usersEmptyState?.classList.remove("hidden");
    return;
  }
  els.usersEmptyState?.classList.add("hidden");
  const rows = users.map((user) => `
    <tr>
      <td class="users-cell-name">
        <p class="users-name">${escapeHtml(user.fullName)}</p>
        <p class="users-user-id">${escapeHtml(user.uid)}</p>
      </td>
      <td>${escapeHtml(user.email || "—")}</td>
      <td>${escapeHtml(areaLabel(user.area))}</td>
      <td><span class="users-role-chip">${escapeHtml(roleLabel(user.requestedRole || resolveRoleByArea(user.area)))}</span></td>
      <td><span class="users-pill is-${escapeHtml(user.approvalStatus)}">${escapeHtml(statusLabel(user.approvalStatus))}</span></td>
      <td><span class="users-role-chip">${escapeHtml(roleLabel(user.role))}</span></td>
      <td>${buildRowActions(user)}</td>
    </tr>
  `).join("");
  els.usersTableBody.innerHTML = rows;
}

function applyFilters() {
  const search = normalizeText(els.searchName?.value || "");
  const area = normalizeArea(els.searchArea?.value || "");
  const status = normalizeText(els.searchStatus?.value || "");
  const role = normalizeText(els.searchRole?.value || "");

  state.filteredUsers = state.users.filter((user) => {
    const matchesSearch = !search
      || normalizeText(user.fullName).includes(search)
      || normalizeText(user.email).includes(search);
    const matchesArea = !area || user.areaNorm === area;
    const matchesStatus = !status || user.approvalStatus === status;
    const matchesRole = !role || user.role === role;
    return matchesSearch && matchesArea && matchesStatus && matchesRole;
  });

  renderUsersTable(state.filteredUsers);
}

async function loadUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  state.users = snapshot.docs.map(mapUser).sort((a, b) => normalizeText(a.fullName).localeCompare(normalizeText(b.fullName), "es"));
  renderStats(state.users);
  applyFilters();
}

function getUserById(userId = "") {
  return state.users.find((user) => user.id === userId) || null;
}

async function approveUser(userId = "") {
  const user = getUserById(userId);
  if (!user) return;
  const targetRole = user.requestedRole || resolveRoleByArea(user.area);
  if (!targetRole) {
    alert("No se pudo determinar el rol solicitado para este usuario.");
    return;
  }
  const ok = confirm(`¿Aprobar a ${user.fullName} con rol ${roleLabel(targetRole)}?`);
  if (!ok) return;

  await updateDoc(doc(db, "users", user.id), {
    requestedRole: targetRole,
    role: targetRole,
    approvalStatus: "approved",
    approvedBy: state.currentAdmin?.uid || "",
    approvedAt: new Date().toISOString(),
    rejectedAt: null,
    rejectedBy: null,
    updatedAt: new Date().toISOString()
  });
  await loadUsers();
}

async function rejectUser(userId = "") {
  const user = getUserById(userId);
  if (!user) return;
  const ok = confirm(`¿Rechazar el acceso de ${user.fullName}?`);
  if (!ok) return;

  await updateDoc(doc(db, "users", user.id), {
    role: "pending",
    approvalStatus: "rejected",
    rejectedBy: state.currentAdmin?.uid || "",
    rejectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await loadUsers();
}

function openEditRoleModal(userId = "") {
  const user = getUserById(userId);
  if (!user || !state.roleModal) return;
  if (els.editUserId) els.editUserId.value = user.id;
  const selectedRole = user.role && user.role !== "pending"
    ? user.role
    : (user.requestedRole || resolveRoleByArea(user.area) || "editor");
  if (els.newRole) els.newRole.value = selectedRole;
  if (els.editRoleHint) {
    els.editRoleHint.textContent = user.approvalStatus === "approved"
      ? `Rol activo de ${user.fullName}.`
      : `Rol solicitado para ${user.fullName}. Al aprobar tomará este rol.`;
  }
  state.roleModal.show();
}

async function saveRoleChanges(event) {
  event.preventDefault();
  const userId = String(els.editUserId?.value || "");
  const role = normalizeText(els.newRole?.value || "");
  if (!userId || !role) return;
  const user = getUserById(userId);
  if (!user) return;

  const payload = {
    requestedRole: role,
    updatedAt: new Date().toISOString()
  };
  if (user.approvalStatus === "approved" && user.role !== "pending") {
    payload.role = role;
  }

  await updateDoc(doc(db, "users", userId), payload);
  state.roleModal?.hide();
  await loadUsers();
}

async function deleteUserById(userId = "") {
  const user = getUserById(userId);
  if (!user) return;
  if (state.currentAdmin?.uid && user.uid === state.currentAdmin.uid) {
    alert("No puedes eliminar tu propio usuario administrador.");
    return;
  }
  const ok = confirm(`¿Eliminar al usuario ${user.fullName}?`);
  if (!ok) return;
  await deleteDoc(doc(db, "users", userId));
  await loadUsers();
}

async function handleTableAction(event) {
  const btn = event.target.closest("[data-action][data-id]");
  if (!btn) return;
  const action = String(btn.dataset.action || "");
  const userId = String(btn.dataset.id || "");
  if (!action || !userId) return;

  btn.disabled = true;
  try {
    if (action === "approve") await approveUser(userId);
    else if (action === "reject") await rejectUser(userId);
    else if (action === "edit-role") openEditRoleModal(userId);
    else if (action === "delete") await deleteUserById(userId);
  } catch (err) {
    alert("No se pudo completar la acción.");
  } finally {
    btn.disabled = false;
  }
}

async function ensureAdminAccess(user) {
  const profile = await findUserProfileByAuthUser(user);
  if (!profile) return { allowed: false, role: "", status: "", reason: "Perfil no encontrado en users." };
  const data = profile.data || {};
  const role = canonicalRole(data.role || data.rol || data.userRole);
  const status = getApprovalStatus(data);
  if (role !== "admin") return { allowed: false, role, status, reason: "El rol no es admin." };
  if (status === "rejected") return { allowed: false, role, status, reason: "La cuenta está rechazada." };
  return { allowed: true, role, status, reason: "" };
}

function bindEvents() {
  els.searchName?.addEventListener("input", applyFilters);
  els.searchArea?.addEventListener("change", applyFilters);
  els.searchStatus?.addEventListener("change", applyFilters);
  els.searchRole?.addEventListener("change", applyFilters);
  els.btnRefreshUsers?.addEventListener("click", loadUsers);
  els.usersTableBody?.addEventListener("click", handleTableAction);
  els.editRoleForm?.addEventListener("submit", saveRoleChanges);
}

bindEvents();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  try {
    const access = await ensureAdminAccess(user);
    if (!access.allowed) {
      await signOut(auth);
      const roleText = access.role || "sin rol";
      const statusText = access.status || "sin estado";
      alert(`No tienes permisos para acceder a Gestión de Usuarios.\nRol detectado: ${roleText}\nEstado detectado: ${statusText}\nDetalle: ${access.reason}`);
      window.location.href = "index.html";
      return;
    }
    state.currentAdmin = user;
    await loadUsers();
  } catch (error) {
    console.error("No se pudo validar el acceso a Gestión de Usuarios.", error);
    alert("No se pudo validar tu acceso a Gestión de Usuarios.");
    await signOut(auth);
    window.location.href = "index.html";
  }
});
