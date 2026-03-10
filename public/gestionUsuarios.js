import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc, addDoc } from 'https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";

// Inicialización de Firebase
const app = initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
const auth = getAuth(app);
const db = getFirestore(app);

let table; // Definir la variable de la tabla

// Verificar si el usuario es admin
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const currentUserId = user.uid;
    
    // Obtener datos del usuario desde Firestore
    const userDocRef = doc(db, 'users', currentUserId);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      
      // Si el rol es admin, mostrar la sección "Gestionar Usuarios"
      if (userData.role === "admin") {
        document.getElementById('gestionUsuariosLink').style.display = 'block';
      } else {
        document.getElementById('gestionUsuariosLink').style.display = 'none';
      }
    }

    // Cargar todos los usuarios
    loadUsers();

  } else {
    window.location.href = "login.html";
  }
});

document.getElementById("btnAgregarUsuario").addEventListener("click", () => {
  const modal = new bootstrap.Modal(document.getElementById("newUserModal"));
  modal.show();
});

document.getElementById("newUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("newFirstName").value.trim();
  const lastName = document.getElementById("newLastName").value.trim();
  const email = document.getElementById("newEmail").value.trim();
  const area = document.getElementById("newArea").value.trim();
  const role = document.getElementById("newRoleSelect").value;

  if (!firstName || !lastName || !email || !area || !role) {
    alert("Por favor, completa todos los campos.");
    return;
  }

  try {
    await addDoc(collection(db, "users"), {
      firstName,
      lastName,
      email,
      area,
      role
    });

    alert("Usuario creado correctamente.");
    document.getElementById("newUserForm").reset();
    bootstrap.Modal.getInstance(document.getElementById("newUserModal")).hide();
    loadUsers();
  } catch (error) {
    alert("Error al crear el usuario. Intenta de nuevo.");
  }
});


// Función para cargar todos los usuarios
async function loadUsers() {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  const userList = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      area: data.area,
      role: data.role
    };
  });

  renderUserTable(userList);
}

$(document).ready(function() {
  // Inicializa DataTable una sola vez
  if (!$.fn.DataTable.isDataTable('#myTable')) {
    table = new DataTable('#myTable', {
      "ordering": true, // Habilitar la ordenación
      "paging": true,   // Habilitar la paginación
      "searching": true // Habilitar la búsqueda
    });
  }
});

// Función para filtrar usuarios
document.getElementById('searchName').addEventListener('input', filterUsers);
document.getElementById('searchArea').addEventListener('input', filterUsers);
document.getElementById('searchRole').addEventListener('change', filterUsers);

async function filterUsers() {
  const name = document.getElementById('searchName').value.toLowerCase();
  const area = document.getElementById('searchArea').value.toLowerCase();
  const role = document.getElementById('searchRole').value;

  const usersRef = collection(db, 'users');
  let q = query(usersRef);

  if (name) q = query(q, where('firstName', '>=', name), where('firstName', '<=', name + '\uf8ff'));
  if (area) q = query(q, where('area', '>=', area), where('area', '<=', area + '\uf8ff'));
  if (role) q = query(q, where('role', '==', role));

  const snapshot = await getDocs(q);
  const userList = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      area: data.area,
      role: data.role
    };
  });

  renderUserTable(userList);
}

// Renderizar tabla de usuarios con DataTable
function renderUserTable(userList) {
  const tbody = document.querySelector('#myTable tbody');
  tbody.innerHTML = '';

  userList.forEach(user => {
    const row = document.createElement('tr');

    const fullName = `${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim();
    const tdName = document.createElement("td");
    tdName.textContent = fullName;
    const tdEmail = document.createElement("td");
    tdEmail.textContent = String(user.email || "");
    const tdArea = document.createElement("td");
    tdArea.textContent = String(user.area || "");
    const tdRole = document.createElement("td");
    tdRole.textContent = String(user.role || "");
    const tdActions = document.createElement("td");

    const editIcon = document.createElement("i");
    editIcon.className = "fas fa-edit";
    editIcon.addEventListener("click", () => openEditModal(String(user.id || "")));
    const deleteIcon = document.createElement("i");
    deleteIcon.className = "fas fa-trash-alt";
    deleteIcon.addEventListener("click", () => deleteUser(String(user.id || "")));

    tdActions.appendChild(editIcon);
    tdActions.appendChild(deleteIcon);
    row.appendChild(tdName);
    row.appendChild(tdEmail);
    row.appendChild(tdArea);
    row.appendChild(tdRole);
    row.appendChild(tdActions);
    tbody.appendChild(row);
  });

  // Reinicializar DataTable (si ya está inicializado, no se vuelve a crear)
  if (table) {
    table.clear();
    table.rows.add($(tbody).children()).draw();
  }
}

// Función para abrir el modal de edición
function openEditModal(userId) {
  const userDocRef = doc(db, 'users', userId);
  const userSnap = getDoc(userDocRef).then((docSnap) => {
    if (docSnap.exists()) {
      const userData = docSnap.data();

      // Prellenar el campo con el rol actual del usuario
      const newRoleSelect = document.getElementById('newRole');
      newRoleSelect.value = userData.role;

      // Mostrar el modal
      const editModal = new bootstrap.Modal(document.getElementById('editRoleModal'));
      editModal.show();

      // Guardar cambios en Firestore
      document.getElementById('saveRoleButton').addEventListener('click', async () => {
        const newRole = newRoleSelect.value;
        await updateDoc(userDocRef, { role: newRole });
        alert('Usuario actualizado');
        loadUsers(); // Refrescar la tabla después de la edición
        editModal.hide(); // Cerrar el modal
      });
    }
  });
}

// Eliminar usuario
async function deleteUser(userId) {
  const confirmDelete = confirm('¿Estás seguro de que quieres eliminar este usuario?');
  if (confirmDelete) {
    await deleteDoc(doc(db, 'users', userId));
    alert('Usuario eliminado');
    loadUsers(); // Refrescar la tabla después de la eliminación
  }
}

// Exponer funciones a la ventana global para que estén accesibles desde el HTML
window.openEditModal = openEditModal;
window.deleteUser = deleteUser;

// Cargar usuarios al cargar la página
loadUsers();
