import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";

import { 
  getFirestore, collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Abrir modal nuevo
document.getElementById("btnSecuenciaAlcance").addEventListener("click", () => {
  document.getElementById("modalSecuencia").style.display = "block";
  document.getElementById("syaDocId").value = ""; // limpiar id para evitar confusión
});

// Cerrar modal
document.getElementById("cerrarModalSecuencia").addEventListener("click", () => {
  document.getElementById("modalSecuencia").style.display = "none";
});

// Guardar/Actualizar formulario
document.getElementById("formSecuenciaAlcance").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = {};

  // Convertir FormData en objeto
  formData.forEach((value, key) => {
    data[key] = value.trim();
  });

  const docId = document.getElementById("syaDocId").value; // si hay id, es edición

  try {
    if (docId) {
      // ✅ Modo edición → actualizar documento existente
      const ref = doc(db, "secuenciaAlcance", docId);
      await updateDoc(ref, data);
      alert("✅ Datos actualizados correctamente.");
    } else {
      // ✅ Modo nuevo → crear documento
      await addDoc(collection(db, "secuenciaAlcance"), data);
      alert("✅ Datos guardados correctamente.");
    }

    form.reset();
    document.getElementById("modalSecuencia").style.display = "none";
  } catch (err) {
    console.error("❌ Error al guardar en Firestore:", err);
    alert("❌ Ocurrió un error al guardar. Revisa la consola.");
  }
});

// Listar secuencias existentes
const btnVerSecuencias = document.getElementById("btnVerSecuencias");
const modalListaSecuencias = document.getElementById("modalListaSecuencias");
const cerrarModalListaSecuencias = document.getElementById("cerrarModalListaSecuencias");
const contenedorSecuenciasGuardadas = document.getElementById("contenedorSecuenciasGuardadas");

btnVerSecuencias?.addEventListener("click", async () => {
  modalListaSecuencias.style.display = "block";
  contenedorSecuenciasGuardadas.innerHTML = "<p>Cargando...</p>";

  const snap = await getDocs(collection(db, "secuenciaAlcance"));
  if (snap.empty) {
    contenedorSecuenciasGuardadas.innerHTML = "<p>No hay registros.</p>";
    return;
  }

  contenedorSecuenciasGuardadas.innerHTML = "";
  snap.forEach(docSnap => {
    const data = docSnap.data();
    const div = document.createElement("div");
    div.style.borderBottom = "1px solid #ccc";
    div.style.padding = "10px";
    div.innerHTML = `
      <strong>${data.nivel || "Nivel"} - ${data.grado || "Grado"} | Trim ${data.trimestre}, Unidad ${data.unidad}</strong>
      <br>
      <button class="btn-editar" data-id="${docSnap.id}"><i class="fas fa-edit"></i></button>
      <button class="btn-eliminar" data-id="${docSnap.id}"><i class="fas fa-trash-alt"></i></button>
    `;
    contenedorSecuenciasGuardadas.appendChild(div);
  });

  // Eliminar documento
  document.querySelectorAll(".btn-eliminar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (confirm("¿Eliminar esta secuencia?")) {
        await deleteDoc(doc(db, "secuenciaAlcance", id));
        btn.parentElement.remove();
      }
    });
  });

  // Editar documento → cargar en formulario
  document.querySelectorAll(".btn-editar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const snap = await getDoc(doc(db, "secuenciaAlcance", id));
      const data = snap.data();
      if (!data) return alert("Documento no encontrado");
  
      // Abrir modal y guardar id
      document.getElementById("modalSecuencia").style.display = "block";
      document.getElementById("syaDocId").value = id;
  
      // Rellenar campos
      const form = document.getElementById("formSecuenciaAlcance");
      Object.keys(data).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = data[key];
      });
    });
  });
});

cerrarModalListaSecuencias?.addEventListener("click", () => {
  modalListaSecuencias.style.display = "none";
});
