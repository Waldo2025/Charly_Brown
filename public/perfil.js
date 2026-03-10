import { initializeApp } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";

let auth = null;
let db = null;
try {
  const app = initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  alert(`Error de configuración Firebase: ${err?.message || "sin detalle"}`);
}

// Referencias de elementos del DOM
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const editButton = document.getElementById('editButton');
const saveButton = document.getElementById('saveButton');

// Obtención de datos del usuario desde Firebase Auth y Firestore
if (auth && db) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Usuario autenticado
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        
        // Rellenar el formulario con los datos del usuario
        usernameInput.value = userData.firstName + " " + userData.lastName || 'Nombre de usuario';
        emailInput.value = user.email || 'Correo electrónico';
        nameInput.value = userData.firstName || '';  // Mostrar el primer nombre
        phoneInput.value = userData.phone || '';  // Mostrar el teléfono
      }

    } else {
      // Redirigir a login si no hay usuario autenticado
      window.location.href = 'index.html';
    }
  });
}

// Habilitar edición
editButton.addEventListener('click', () => {
  nameInput.disabled = false;
  phoneInput.disabled = false;
  saveButton.disabled = false;
  editButton.disabled = true;
});

// Guardar cambios en Firestore
document.getElementById('perfilForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!auth || !db) {
    alert('Firebase no está disponible.');
    return;
  }
  const user = auth.currentUser;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      firstName: nameInput.value,  // Actualizar el primer nombre
      phone: phoneInput.value
    });

    alert('Perfil actualizado exitosamente');
    saveButton.disabled = true;
    editButton.disabled = false;
    nameInput.disabled = true;
    phoneInput.disabled = true;

  } catch (err) {
    alert('Hubo un error al guardar los cambios.');
  }
});
