import { initializeApp } from "https://www.gstatic.com/firebasejs/9.19.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.19.1/firebase-auth.js";
import {
  getFirestore,
  setDoc,
  doc,
  getDocs,
  collection,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.19.1/firebase-firestore.js";

// 🔥 Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

// Mostrar y ocultar modales
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const userLoginBtn = document.getElementById("userLoginBtn");
  const registerUserBtn = document.getElementById("registerUserBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
      loginModal.show();
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      const modalEl = document.getElementById("registerModal");
      const registerModal = new bootstrap.Modal(modalEl);
      
      registerModal.show();
  
      // Asegúrate de que aria-hidden se quite después de mostrar
      modalEl.addEventListener("shown.bs.modal", () => {
        modalEl.removeAttribute("aria-hidden"); // 👈 forzamos el cambio
      });
    });
  }

  // Evento de inicio de sesión
  if (userLoginBtn) {
    userLoginBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      if (!email || !password) {
        alert("Por favor, ingresa tu correo electrónico y contraseña.");
        return;
      }

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("✅ Usuario autenticado:", user.email);

        const rolUsuario = await verificarRolUsuarioPorEmail(user.email);
        if (!rolUsuario) {
          alert("Tu cuenta no tiene rol asignado. Contacta al administrador.");
          return;
        }

        console.log("🔍 Rol del usuario:", rolUsuario);
        window.location.href = "generarLectura.html"; // Redirige sin importar rol

      } catch (error) {
        console.error("Error de inicio de sesión:", error.code);
        switch (error.code) {
          case "auth/user-not-found":
            alert("El correo no está registrado.");
            break;
          case "auth/wrong-password":
            alert("Contraseña incorrecta.");
            break;
          case "auth/invalid-email":
            alert("Correo inválido.");
            break;
          default:
            alert(`Error: ${error.message}`);
        }
      }
    });
  }

  // Evento de registro de usuario
  if (registerUserBtn) {
    registerUserBtn.addEventListener("click", async () => {
      const firstName = document.getElementById("firstName").value.trim();
      const lastName = document.getElementById("lastName").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const area = document.getElementById("areaSelect").value;
      const role = document.getElementById("roleSelect").value;

      if (!firstName || !lastName || !email || !password || !area || !role) {
        alert("Por favor, completa todos los campos.");
        return;
      }

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await setDoc(doc(firestore, "users", uid), {
          uid,
          firstName,
          lastName,
          email,
          area,
          role,
          createdAt: new Date().toISOString(),
        });
        
        alert("✅ Usuario registrado con éxito.");
        
        // Esperar a que el usuario esté activo antes de redirigir
        onAuthStateChanged(auth, (user) => {
          if (user) {
            window.location.href = "home.html";
          }
        });
        

      } catch (error) {
        console.error("Error de registro:", error.code);
        switch (error.code) {
          case "auth/email-already-in-use":
            alert("Este correo ya está registrado.");
            break;
          case "auth/invalid-email":
            alert("El correo electrónico no es válido.");
            break;
          case "auth/weak-password":
            alert("La contraseña debe tener al menos 6 caracteres.");
            break;
          default:
            alert(`Error: ${error.message}`);
        }
      }
    });
  }
});

// Función para verificar el rol del usuario en Firestore
async function verificarRolUsuarioPorEmail(email) {
  const userQuery = query(collection(firestore, "users"), where("email", "==", email));
  const querySnapshot = await getDocs(userQuery);

  if (querySnapshot.empty) {
    console.warn("❌ No se encontró el usuario en Firestore.");
    return null;
  }

  const userData = querySnapshot.docs[0].data();
  return userData.role || null;
}

