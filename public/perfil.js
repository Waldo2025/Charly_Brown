import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';

// Configuración Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
    authDomain: "charly-brown.firebaseapp.com",
    projectId: "charly-brown",
    storageBucket: "charly-brown.firebasestorage.app",
    messagingSenderId: "128488238449",
    appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
    measurementId: "G-RL0BMDZKE6"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

// Referencias de elementos del DOM
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const editButton = document.getElementById('editButton');
const saveButton = document.getElementById('saveButton');

// Obtención de datos del usuario desde Firebase Auth y Firestore
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
    console.error('Error al guardar los cambios:', err);
    alert('Hubo un error al guardar los cambios.');
  }
});


