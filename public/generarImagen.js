import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getStorage, ref, uploadString, listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { buildApiUrl, getAuthHeaders } from './api-client.js';

const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);

signInAnonymously(auth).catch(() => {});

const promptInput = document.getElementById("prompt");
const modeloSelect = document.getElementById("modelo");
const imagen = document.getElementById("imagenGenerada");
const boton = document.getElementById("generarImagen");

async function generarMapaMentalGemini(textoLectura) {
  const prompt = `
      You are a visual educational designer. Read the following text and extract 5 to 7 key concepts. 
      For each one, provide a short label and a list of simple emoji or visual ideas (like animals, objects, nature, etc.) that can be used to illustrate that concept. 
      Return only JSON in this format:

      [
        { "concept": "Concept Name", "visuals": ["icon1", "description2", ...] },
        ...
      ]

      Text:
      """${textoLectura}"""
      `;

  const headers = await getAuthHeaders({ "Content-Type": "application/json" });
  const response = await fetch(buildApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      payload: { contents: [{ parts: [{ text: prompt }] }] }
    })
  });

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  try {
    const rawCleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(rawCleaned);
  } catch (_) {
    return null;
  }
}

boton?.addEventListener("click", async () => {
  const description = promptInput?.value?.trim() || "";
  const modelo = modeloSelect?.value || "";

  if (!description) {
    alert("Por favor, escribe o pega una lectura.");
    return;
  }

  imagen.innerHTML = "";
  boton.disabled = true;
  boton.textContent = "Generando...";

  try {
    if (modelo === "gemini-mindmap") {
      const resultado = await generarMapaMentalGemini(description);
      if (resultado) {
        resultado.forEach((item) => {
          const card = document.createElement("div");
          card.style.border = "1px solid #ccc";
          card.style.borderRadius = "12px";
          card.style.padding = "1rem";
          card.style.margin = "1rem";
          card.style.background = "#fff";
          card.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
          card.style.width = "250px";
          card.style.fontSize = "1.1rem";

          const title = document.createElement("h3");
          title.textContent = item.concept;
          const visuals = document.createElement("p");
          visuals.textContent = Array.isArray(item.visuals) ? item.visuals.join(" ") : "";

          card.appendChild(title);
          card.appendChild(visuals);
          imagen.appendChild(card);
        });
      } else {
        imagen.textContent = "Error al generar mapa mental.";
      }
      return;
    }

    imagen.textContent = "La generación directa de imágenes fue retirada. Usa esta vista solo para mapas visuales.";
  } catch (_) {
    alert("Hubo un error. Revisa la consola.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Generar mapa visual";
  }
});

async function cargarImagenesGuardadas() {
  const contenedor = document.getElementById("contenedorGuardadas");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  const folderRef = ref(storage, 'mindmap/');
  const result = await listAll(folderRef);

  for (const itemRef of result.items) {
    const url = await getDownloadURL(itemRef);
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.marginBottom = "0.5rem";
    contenedor.appendChild(img);
  }
}

async function guardarEnFirebase(nombre, dataURL) {
  if (!auth.currentUser) {
    alert("Debes iniciar sesión para guardar imágenes.");
    return;
  }

  const storageRef = ref(storage, `mindmap/${nombre}.png`);
  try {
    await uploadString(storageRef, dataURL, 'data_url');
    await cargarImagenesGuardadas();
  } catch (_) {
    // noop
  }
}

window.guardarMapaMentalEnFirebase = guardarEnFirebase;
void cargarImagenesGuardadas();
