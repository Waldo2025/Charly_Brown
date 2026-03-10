import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';

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

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);  // Usamos auth después de inicializar la app


// Modal de confirmación
const modal = document.getElementById("confirmationModal");
const closeModalBtn = document.getElementById("closeModalBtn");

// Lógica para cerrar el modal
closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
});

document.addEventListener("DOMContentLoaded", () => {
    const form           = document.getElementById("createUnidadForm");
    const nivelField     = document.getElementById("nivel");
    const gradoField     = document.getElementById("grado");
    const trimestreField = document.getElementById("trimestre");
    const unidadField    = document.getElementById("unidad");
    const materiaField   = document.getElementById("materia");
    const nombreField    = document.getElementById("nombreUnidad");
    const privacidadField= document.getElementById("privacidad");
  
    // Actualiza grados según nivel
    const actualizarGrado = () => {
      let opciones = [];
      switch (nivelField.value) {
        case "Preescolar": opciones = ["Primero","Segundo","Tercero"]; break;
        case "PF":         opciones = ["PrePrimaria"];            break;
        case "Primaria":   opciones = ["Primero","Segundo","Tercero","Cuarto","Quinto","Sexto"]; break;
        case "Secundaria": opciones = ["Primero","Segundo","Tercero"]; break;
      }
      gradoField.innerHTML = "";
      opciones.forEach(g => {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        gradoField.appendChild(o);
      });
    };
    nivelField.addEventListener("change", actualizarGrado);
    nivelField.dispatchEvent(new Event("change"));
  
    // Rellena trimestre (1-3)
    ["1","2","3"].forEach(t => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      trimestreField.appendChild(o);
    });
    // Rellena unidades (1-15)
    Array.from({length:15},(_,i)=>i+1).forEach(n => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      unidadField.appendChild(o);
    });
  
    // Envío de formulario
    if (!form) return;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const nivel      = nivelField.value;
      const grado      = gradoField.value;
      const trimestre  = trimestreField.value;
      const unidad     = unidadField.value;
      const materia    = materiaField.value;
      const nombre     = nombreField.value.trim();
      const privacidad = privacidadField.value;
  
      if (!nivel || !grado || !trimestre || !unidad || !materia || !nombre) {
        return alert("Por favor complete todos los campos.");
      }
  
      const user = auth.currentUser;
      if (!user) {
        return alert("Debe iniciar sesión para crear una unidad.");
      }
  
      try {
        const unidadData = {
          nivel,
          grado,
          trimestre,
          unidad,
          materia,
          nombreUnidad: nombre,
          privacidad,
          userId: user.uid,
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, "Unidades"), unidadData);
  
        form.style.display  = "none";
        modal.style.display = "flex";
        setTimeout(() => {
          window.location.href = 'UnidadHome.html';
        }, 2000);
      } catch (err) {
        alert("Hubo un error al crear la unidad.");
      }
    });
  });
  
  
  
  
  