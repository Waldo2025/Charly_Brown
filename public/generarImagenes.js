import { InferenceClient } from 'https://cdn.jsdelivr.net/npm/@huggingface/inference@3.7.1/+esm';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getStorage, ref, uploadString, listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { deleteObject } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js'; // Asegúrate de tener esta importación
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, setDoc } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';

const googleAPIKey = "__GEMINI_VISION_API_KEY_LOCAL__";
const googleAPIEndpoint = "https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent";


const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);



onAuthStateChanged(auth, (user) => {
    if (user) {
    } else {
    }
    if (!auth.currentUser) {
        return;
      }
  });



const HF_TOKEN = "__HF_API_KEY_LOCAL__";
const inference = new InferenceClient(HF_TOKEN);

const falModels = new Set([
  "HiDream-ai/HiDream-I1-Full",
  "HiDream-ai/HiDream-I1-Dev",
  "HiDream-ai/HiDream-I1-Fast",
  "black-forest-labs/FLUX.1-schnell",
  "black-forest-labs/FLUX.1-dev",
  "stabilityai/stable-diffusion-3.5-large",
  "stabilityai/stable-diffusion-3-medium",
  "stabilityai/stable-diffusion-2-1",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "stablediffusionapi/stable-diffusion-xl-base-1.0",
  "ByteDance/SDXL-Lightning",
  "ByteDance/Hyper-SDXL",
  "Kwai-Kolors/Kolors",
  "nerijs/pixel-art-xl",
  "Zuntan03/sdxl-zunmix-v2",
  "marcogdepinto/dreamshaper-xl-turbo"
]);

let modelLoadedInternamente = false;
let ultimaImagenLeftPrompt = "";
let ultimaImagenLeftUrl = "";
let imagenSeleccionadaIA = null;
let imagenesGaleria = [];  // Array de objetos: { url, nombre }
let indiceActual = 0;


document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const generador = document.getElementById("contenedorGeneradorImagenes");
    const panelGuardadas = document.getElementById("contenedorPanelGuardadas");
    const panelLecturas = document.getElementById("panelLecturasGuardadas");
    const generadorLecturas = document.getElementById("modalGeneradorLecturas");
    const lecturaModal = document.getElementById("lecturaModal");

    if (generador && generador.style.display !== "none") {
      generador.style.display = "none";
    }

    if (panelGuardadas && panelGuardadas.style.display !== "none") {
      panelGuardadas.style.display = "none";
    }

    if (panelLecturas && panelLecturas.style.display !== "none") {
      panelLecturas.style.display = "none";
    }

    if (generadorLecturas && generadorLecturas.style.display !== "none") {
      generadorLecturas.style.display = "none";
    }

    if (lecturaModal && lecturaModal.style.display !== "none") {
      lecturaModal.style.display = "none";
    }
  }
});



document.addEventListener("DOMContentLoaded", () => {
  // ——— Abrir/Cerrar galería de imágenes ———
  const btnGaleria    = document.getElementById("btnAbrirPanelImagenes");
  const modalGaleria  = document.getElementById("modalImagenes");
  const closeGaleria  = modalGaleria.querySelector(".close-modal");
  if (btnGaleria && modalGaleria && closeGaleria) {
    btnGaleria.addEventListener("click", () => {
      modalGaleria.style.display = "block";
    });
    closeGaleria.addEventListener("click", () => {
      modalGaleria.style.display = "none";
    });
  }

  // ——— Abrir/Cerrar generador de ilustración ———
  const btnGenerador    = document.getElementById("btnAbrirGeneradorImagenes");
  const modalGenerador  = document.getElementById("modalGeneradorIlustracion");
  const closeGenerador  = modalGenerador.querySelector(".close-modal");
  if (btnGenerador && modalGenerador && closeGenerador) {
    btnGenerador.addEventListener("click", () => {
      // 1) mostramos el modal
      modalGenerador.style.display = "block";
      // 2) cargamos la galería dentro de ese modal
      const galeriaEnModal = modalGenerador.querySelector("#contenedorGuardadasManual");
      if (galeriaEnModal) {
        cargarGaleriaImagenesGeneradas(galeriaEnModal, true);
      }
    });
    closeGenerador.addEventListener("click", () => {
      modalGenerador.style.display = "none";
    });
  }
});



function mostrarModalConCajas(imagenUrl, nombreArchivo, index = 0, galeria = []) {
  if (!imagenUrl || !nombreArchivo) {
    return;
  }

  imagenesGaleria = galeria;
  indiceActual = index;
  const contenedor = document.getElementById("contenidoVistaConTexto");
  contenedor.innerHTML = "";

  // Wrapper principal
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.margin = "0 auto";
  wrapper.style.maxWidth = "100%";
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "center";

  // Imagen principal
  const img = new Image();
  img.src = imagenUrl;
  img.style.width = "100%";
  img.style.maxWidth = "1000px";
  img.style.display = "block";
  img.style.borderRadius = "8px";
  img.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
  wrapper.appendChild(img);
  contenedor.appendChild(wrapper);

  img.onload = () => {
    const anchoImagen = img.offsetWidth;
    const anchoCaja = anchoImagen * 0.3 + "px";

    // Detectar tipo de imagen
    const esCompleto = nombreArchivo?.startsWith("spread_completo") || nombreArchivo?.startsWith("spread_both");
    const esImagen = nombreArchivo?.startsWith("imagen_");
    const esMitadIzquierda = /spread_mitad_\d+_izquierda/.test(nombreArchivo);
    const esMitadDerecha = /spread_mitad_\d+_derecha/.test(nombreArchivo);
    const esLeft = nombreArchivo?.startsWith("spread_left_");
    const esRight = nombreArchivo?.startsWith("spread_right_");

    // Caja izquierda
    if (esCompleto || esImagen || esMitadIzquierda || esLeft) {
      const cajaIzq = document.createElement("div");
      cajaIzq.className = "caja-texto-izquierda";
      cajaIzq.innerHTML = textoSimulado();
      aplicarEstiloCaja(cajaIzq, "left", anchoCaja);
      wrapper.appendChild(cajaIzq);
    }

    // Caja derecha
    if (esCompleto || esImagen || esMitadDerecha || esRight) {
      const cajaDer = document.createElement("div");
      cajaDer.className = "caja-texto-derecha";
      cajaDer.innerHTML = textoSimulado();
      aplicarEstiloCaja(cajaDer, "right", anchoCaja);
      wrapper.appendChild(cajaDer);
    }

    // Botón ocultar/mostrar cajas
    const toggleBtn = document.createElement("button");
    toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    toggleBtn.title = "Mostrar/Ocultar cajas";
    Object.assign(toggleBtn.style, {
      position: "absolute",
      top: "10px",
      right: "10px",
      zIndex: "9999",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "50%",
      width: "40px",
      height: "40px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
    });
    wrapper.appendChild(toggleBtn);

    let cajasVisibles = true;
    toggleBtn.addEventListener("click", () => {
      cajasVisibles = !cajasVisibles;
      wrapper.querySelectorAll(".caja-texto-izquierda, .caja-texto-derecha").forEach(caja => {
        caja.style.display = cajasVisibles ? "block" : "none";
      });
      toggleBtn.innerHTML = cajasVisibles ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });

    // Botón anterior
    const btnAnterior = document.createElement("button");
    btnAnterior.innerHTML = "&lt;";
    Object.assign(btnAnterior.style, {
      position: "absolute",
      top: "50%",
      left: "10px",
      transform: "translateY(-50%)",
      background: "#fff",
      border: "none",
      borderRadius: "50%",
      width: "50px",
      height: "50px",
      fontSize: "22px",
      fontWeight: "bold",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      zIndex: "9999",
      cursor: "pointer"
    });
    btnAnterior.onclick = () => {
      if (indiceActual > 0) {
        const anterior = imagenesGaleria[indiceActual - 1];
        mostrarModalConCajas(anterior.url, anterior.name, indiceActual - 1, imagenesGaleria);
      }
    };
    wrapper.appendChild(btnAnterior);

    // Botón siguiente
    const btnSiguiente = document.createElement("button");
    btnSiguiente.innerHTML = "&gt;";
    Object.assign(btnSiguiente.style, {
      position: "absolute",
      top: "50%",
      right: "10px",
      transform: "translateY(-50%)",
      background: "#fff",
      border: "none",
      borderRadius: "50%",
      width: "50px",
      height: "50px",
      fontSize: "22px",
      fontWeight: "bold",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      zIndex: "9999",
      cursor: "pointer"
    });
    btnSiguiente.onclick = () => {
      if (indiceActual < imagenesGaleria.length - 1) {
        const siguiente = imagenesGaleria[indiceActual + 1];
        mostrarModalConCajas(siguiente.url, siguiente.name, indiceActual + 1, imagenesGaleria);
      }
    };
    wrapper.appendChild(btnSiguiente);
  };

  // Mostrar modal Bootstrap
  document.querySelector("#modalVistaCajasTexto .modal-title").textContent = nombreArchivo;
  const modal = new bootstrap.Modal(document.getElementById("modalVistaCajasTexto"));
  modal.show();
}


function aplicarEstiloCaja(div, lado) {
  div.style.cssText = `
    position: absolute;
    bottom: 36%;
    ${lado}: 5%;
    width: 285px;
    padding: 1rem;
    background: #fdff88;
    color: black;
    font-size: smaller;
    font-family: sans-serif;
    text-align: justify;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    max-height: 500px;
    overflow-y: auto;
  `;
}

function textoSimulado() {
  return `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tincidunt, erat ac porta blandit. Fusce in fermentum metus. Quisque vel lorem in nulla pretium tincidunt. Etiam id eros vitae nunc.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tincidunt, erat ac porta blandit. Fusce in fermentum metus. Quisque vel lorem in nulla pretium tincidunt. Etiam id eros vitae nunc.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tincidunt, erat ac porta blandit. Fusce in fermentum metus. Quisque vel lorem in nulla pretium tincidunt. Etiam id eros vitae nunc.</p>`;
}


window.addEventListener("DOMContentLoaded", async () => {
  // Inicializar generador
  insertarGeneradorImagenes("#generadorImagenesContainer");
  const ultima = localStorage.getItem("ultimaImagenGeneradaDataURL");
  if (ultima) {
    const contenedor = document.querySelector("#imagenGenerada");
    const img = document.createElement("img");
    img.src = ultima;
    img.style.maxWidth = "1000px";
    img.style.borderRadius = "8px";
    img.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    contenedor.appendChild(img);
  }

  
  // Esperar autenticación
  await new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve();
    });
  });

  // Cargar galería
  const galeria = document.getElementById("contenedorGuardadasManual");
  if (galeria) {
    await cargarGaleriaImagenesGeneradas(galeria, true); // 👈 fuerza actualización
  }
});


async function cargarGaleriaImagenesGeneradas(panel, forceUpdate = false) {
  try {
    const user = auth.currentUser;
    if (!user) {
      panel.innerHTML = '<p class="info-message">Inicia sesión para ver tus imágenes</p>';
      return;
    }

    // Verificar cache
    const cacheKey = `galeria_${user.uid}`;
    if (!forceUpdate) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        renderizarImagenes(panel, JSON.parse(cached));
        return;
      }
    }

    panel.innerHTML = '<p class="loading-message">Cargando imágenes...</p>';

    // Obtener imágenes de Firebase Storage
    const storageRef = ref(storage, `imagenes/${user.uid}/`);
    localStorage.removeItem(`galeria_${user.uid}`);

    const result = await listAll(storageRef);

    if (result.items.length === 0) {
      panel.innerHTML = '<p class="empty-message">No hay imágenes guardadas aún</p>';
      return;
    }

    // Obtener URLs
    const imagenes = await Promise.all(
      result.items.map(async (item) => {
        const url = await getDownloadURL(item);
        return {
          name: item.name.replace('.png', ''),
          url,
          fullPath: item.fullPath
        };
      })
    );

    const db = getFirestore(app);
    const snap = await getDocs(query(
      collection(db, "imagenesCompartidas"),
      where("uid", "==", user.uid)
    ));

    const estadosCompartidos = {};
    snap.forEach(doc => {
      const { nombre, share } = doc.data();
      estadosCompartidos[nombre] = share;
    });

    // Asigna estado a cada imagen
    imagenes.forEach(img => {
      img.shared = estadosCompartidos[img.name] || false;
    });


    // Guardar en cache y renderizar
    localStorage.setItem(cacheKey, JSON.stringify(imagenes));
    renderizarImagenes(panel, imagenes);

  } catch (error) {
    panel.innerHTML = `<p class="error-message">Error al cargar imágenes: ${error.message}</p>`;
  }
}


// ✅ Funciones auxiliares


async function generarMapaMentalGemini(texto) {

  const prompt = `Devuelve un JSON con conceptos clave y emojis para representar el texto: """${texto}"""`;

  const res = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const raw = await res.json();
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function dividirPalabrasTexto(texto) {
  return texto.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}


async function guardarEnFirebase(nombre, blobUrl) {
  const user = auth.currentUser;
  if (!user) {
    alert("Inicia sesión para guardar.");
    return;
  }


  

  const blob = await fetch(blobUrl).then(r => r.blob());
  const dataURL = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const refImg = ref(storage, `mindmap/${nombre}.png`);
  await uploadString(refImg, dataURL, 'data_url');
}

async function guardarImagenGeneradaEnFirebase(nombre, blobUrl) {
  const user = auth.currentUser;
  if (!user) {
    alert("Inicia sesión para guardar.");
    return;
  }

  const blob = await fetch(blobUrl).then(r => r.blob());
  const dataURL = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const refImg = ref(storage, `imagenes/${user.uid}/${nombre}.png`);
  await uploadString(refImg, dataURL, 'data_url');
}

  
async function cargarImagenesGuardadas(panel) {
  const user = auth.currentUser;
  if (!user) return;

  const listRef = ref(storage, 'mindmap/');
  const res = await listAll(listRef);

  const imagenes = await Promise.all(res.items.map(async (item) => {
    const url = await getDownloadURL(item);
    return {
      name: item.name.replace('.png', ''),
      url,
      fullPath: item.fullPath,
      share: false // por defecto
    };
  }));

  // 🔍 Consulta en Firestore si están compartidas
  const db = getFirestore(app);
  const snapshot = await getDocs(
    query(collection(db, "imagenesCompartidas"), where("uid", "==", user.uid))
  );

  const compartidas = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    compartidas[data.nombre] = data.share;
  });

  // ✅ Añade la propiedad `share` a cada imagen si aplica
  imagenes.forEach(img => {
    if (compartidas[img.name] === true) {
      img.share = true;
    }
  });

  renderizarImagenes(panel, imagenes);
}


function renderizarImagenes(panel, imagenes) {
  panel.innerHTML = '';

  // Guardar la galería completa
  imagenesGaleria = imagenes; 

  imagenes.forEach((img) => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 8px;
      background: #f8fafc;
      border: 4px solid; /* más grueso para que el degradado se note */
      border-image: linear-gradient(45deg, #38bdf8, #6366f1) 1;
      transition: transform 0.2s;
    `;
    card.onmouseenter = () => card.style.transform = 'scale(1.03)';
    card.onmouseleave = () => card.style.transform = 'scale(1)';

    const imgElement = document.createElement('img');
    imgElement.src = img.url;
    imgElement.style.cssText = `
      width: 100%;
      height: 100px;
      object-fit: cover;
      border-radius: 4px;
      cursor: pointer;
    `;
    imgElement.title = img.name;
    imgElement.onclick = () => window.open(img.url, '_blank');

    const name = document.createElement('span');
    name.textContent = img.name.length > 15 ? 
      img.name.substring(0, 12) + '...' : 
      img.name;
    name.style.cssText = `
      font-size: 0.8rem;
      text-align: center;
      word-break: break-all;
    `;

    const verCajasBtn = document.createElement('button');
    verCajasBtn.innerHTML = '👁';
    verCajasBtn.title = 'Mostrar con cajas de texto';
    verCajasBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(0,0,0,0.6);
      color: white;
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      font-size: 14px;
      cursor: pointer;
      z-index: 10;
    `;
    verCajasBtn.onclick = () => {
      const index = imagenes.findIndex(i => i.name === img.name);
      mostrarModalConCajas(img.url, img.name, index, imagenes);
    };

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.appendChild(imgElement);
    wrapper.appendChild(verCajasBtn);
    
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5rem';

    // Botón Compartir
    const shareBtn = document.createElement('button');
    shareBtn.innerHTML = '<i class="fa-solid fa-share"></i>';
    shareBtn.title = 'Compartir';
    const isShared = img.share || img.shared; // Compatibilidad con ambas propiedades
    shareBtn.style.background = isShared ? '#22c55e' : '#e5e7eb';
    shareBtn.style.color = isShared ? 'white' : '#333';
    
    shareBtn.onclick = async (e) => {
      e.stopPropagation();
    
      if (!img.share && !img.shared) {
        // Mostrar modal de compartir
        document.getElementById("modalCompartirImagenFirebase").style.display = "block";
        document.getElementById("confirmarCompartirBtn").onclick = async () => {
          const nivel = document.getElementById("compartirNivel").value;
          const grado = document.getElementById("compartirGrado").value;
          const trimestre = document.getElementById("compartirTrimestre").value;
          const unidad = document.getElementById("compartirUnidad").value;
      
          if (!nivel || !grado || !trimestre || !unidad) {
            alert("⚠️ Por favor completa todos los campos.");
            return;
          }
      
          const db = getFirestore(app);
          const imgRef = doc(db, "imagenesCompartidas", img.name);
      
          await setDoc(imgRef, {
            uid: auth.currentUser.uid,
            nombre: img.name,
            url: img.url,
            share: true,
            nivel,
            grado,
            trimestre,
            unidad,
            timestamp: new Date()
          });
      
          img.share = true;
          img.shared = true; // importante para que no se repita
          shareBtn.style.background = '#22c55e';
          shareBtn.style.color = 'white';
          document.getElementById("modalCompartirImagenFirebase").style.display = "none";
        };
      
        document.getElementById("cancelarCompartirBtn").onclick = () => {
          document.getElementById("modalCompartirImagenFirebase").style.display = "none";
        };
      } else {
        // Descompartir directamente
        const db = getFirestore(app);
        await setDoc(doc(db, "imagenesCompartidas", img.name), {
          uid: auth.currentUser.uid,
          nombre: img.name,
          url: img.url,
          share: false,
          timestamp: new Date()
        });
      
        img.share = false;
        img.shared = false;
        shareBtn.style.background = '#e5e7eb';
        shareBtn.style.color = '#333';
      }
      
    };
    
    
    // Botón Descargar
    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.title = 'Descargar';
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = img.url;
      a.download = img.name + '.png';
      a.click();
    };

    // Botón Eliminar
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = 'Eliminar';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`¿Eliminar "${img.name}"?`)) {
        try {
          await deleteObject(ref(storage, img.fullPath));
          // Eliminar del cache local
          const cacheKey = `galeria_${auth.currentUser.uid}`;
          const cached = JSON.parse(localStorage.getItem(cacheKey));
          const updated = cached.filter(i => i.fullPath !== img.fullPath);
          localStorage.setItem(cacheKey, JSON.stringify(updated));
          // Volver a renderizar
          renderizarImagenes(panel, updated);
        } catch (error) {
          alert("Error al eliminar imagen");
        }
      }
    };

    // Estilos para botones
    [downloadBtn, deleteBtn].forEach(btn => {
      btn.style.cssText = `
        padding: 0.25rem 0.5rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
      `;
    });
    downloadBtn.style.background = '#3b82f6';
    downloadBtn.style.color = 'white';
    deleteBtn.style.background = '#ef4444';
    deleteBtn.style.color = 'white';

    btnContainer.appendChild(shareBtn);
    btnContainer.appendChild(downloadBtn);
    btnContainer.appendChild(deleteBtn);


    card.appendChild(wrapper);
    card.appendChild(name);
    card.appendChild(btnContainer);
    panel.appendChild(card);
  });
}


function abrirEditorImagenIA(img) {
  imagenSeleccionadaIA = img;
  document.getElementById("promptEdicionIA").value = "";
  document.getElementById("modalEditarIA").style.display = "flex";
}

document.getElementById("cancelarEdicionIA").addEventListener("click", () => {
  document.getElementById("modalEditarIA").style.display = "none";
});

document.getElementById("confirmarEdicionIA").addEventListener("click", async () => {
  const prompt = document.getElementById("promptEdicionIA").value.trim();
  if (!prompt || !imagenSeleccionadaIA) return;

  document.getElementById("modalEditarIA").style.display = "none";

  const originalUrl = imagenSeleccionadaIA.url;
  const nombreOriginal = imagenSeleccionadaIA.name;

  const blob = await fetch(originalUrl).then(res => res.blob());

  const arrayBuffer = await blob.arrayBuffer();

  const result = await inference.imageToImage(
    "black-forest-labs/FLUX.1-dev",
    new Uint8Array(arrayBuffer),
    {
      prompt,
      strength: 0.75,
      guidance_scale: 8
    }
  );
  


  if (result instanceof Blob) {
    const nuevaURL = URL.createObjectURL(result);
    const nuevoNombre = nombreOriginal + "_edit_" + Date.now();
    await guardarImagenGeneradaEnFirebase(nuevoNombre, nuevaURL);
    alert("✅ Imagen editada y guardada como " + nuevoNombre);
    cargarGaleriaImagenesGeneradas(document.getElementById("contenedorGuardadasManual"), true);
  } else {
    alert("❌ No se pudo editar la imagen.");
  }
});


// Configura comportamiento de cambio de nivel -> grados
const nivelSelect = document.getElementById("compartirNivel");
const gradoSelect = document.getElementById("compartirGrado");

nivelSelect.addEventListener("change", () => {
  const nivel = nivelSelect.value;
  gradoSelect.innerHTML = '<option value="">-- Selecciona grado --</option>';

  let grados = [];

  if (nivel === "Preescolar") {
    grados = ["Primero", "Segundo", "Tercero", "PF"];
  } else if (nivel === "Primaria") {
    grados = ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"];
  } else if (nivel === "Secundaria") {
    grados = ["Primero", "Segundo", "Tercero"];
  }

  grados.forEach(grado => {
    const option = document.createElement("option");
    option.value = grado;
    option.textContent = grado;
    gradoSelect.appendChild(option);
  });
});




window.addEventListener("DOMContentLoaded", () => {
  const abrirBtn = document.getElementById("btnAbrirPanelGuardadas");
  const cerrarBtn = document.getElementById("cerrarPanelGuardadas");
 

  if (abrirBtn && cerrarBtn) {
    abrirBtn.addEventListener("click", () => {
      const panel = document.getElementById("contenedorPanelGuardadas");
      panel.style.display = "block";
      const contenedor = document.getElementById("contenedorGuardadasManual");
      cargarImagenesGuardadas(contenedor);
    });

    cerrarBtn.addEventListener("click", () => {
      document.getElementById("contenedorPanelGuardadas").style.display = "none";
    });



  } else {
  }


    // Mostrar/ocultar área para nuevo MindMap
  const nuevoBtn = document.getElementById("nuevoMindMapBtn");
  const areaMindmap = document.getElementById("areaNuevoMindmap");
  const generarMindmapBtn = document.getElementById("generarMindmapBtn");
  const resultadoMindmap = document.getElementById("resultadoMindmap");

  nuevoBtn.addEventListener("click", () => {
    const visible = areaMindmap.style.display === "block";
    areaMindmap.style.display = visible ? "none" : "block";
    resultadoMindmap.innerHTML = "";
  
    if (!visible) {
      estadoGeneracion = "play"; // Siempre listo para generar
      generarMindmapAutomatico(); // Esto mostrará fondo + controles SIEMPRE
    }
  });
  

  // Filtro del buscador
  const buscador = document.getElementById("buscadorImagenes");
  buscador.addEventListener("input", () => {
    const filtro = buscador.value.toLowerCase();
    document.querySelectorAll("#contenedorGuardadasManual img").forEach(img => {
      img.parentElement.style.display = img.title.toLowerCase().includes(filtro) ? "block" : "none";
    });
  });

  // 🔵 Posiciones definidas para cada palabra dentro del fondo mindmapBackground.png
  const posicionesPorBloque = [
    { top: 30, left: 50 },
    { top: 30, left: 430 },
    { top: 180, left: 50 },
    { top: 180, left: 430 },
    { top: 330, left: 50 },
    { top: 330, left: 430 },
    { top: 480, left: 50 },
    { top: 480, left: 430 },
    { top: 630, left: 50 },
    { top: 630, left: 430 },
    { top: 780, left: 50 },
    { top: 780, left: 430 },
    { top: 930, left: 50 },
    { top: 930, left: 430 }
    // Agrega más si tu fondo tiene más bloques
  ];

  let palabraIndex = 0; 
  let estadoGeneracion = "pause"; // "play", "pause", "stop"
  let progresoIndexIzq = 0;
  let progresoIndexDer = 0;
  let palabrasIzquierdaGlobal = [];
  let palabrasDerechaGlobal = [];
  let canvasMindmap = null;

  async function generarMindmapAutomatico() {
    const texto1 = document.getElementById("textoMindmapParte1").value;
    const texto2 = document.getElementById("textoMindmapParte2").value;

    if (!texto1.trim() && !texto2.trim()) {
    }

    const palabrasIzquierda = texto1.split(/\s+/).map(p => p.toLowerCase().replace(/[.,;:!?()¿¡"]/g, ""));
    const palabrasDerecha = texto2.split(/\s+/).map(p => p.toLowerCase().replace(/[.,;:!?()¿¡"]/g, ""));
    palabrasIzquierdaGlobal = palabrasIzquierda;
    palabrasDerechaGlobal = palabrasDerecha;
    

    const resultadoMindmap = document.getElementById("resultadoMindmap");

    const stepXIzqActual = document.getElementById("stepXIzq")?.value || 27;
    const maxIzqActual = document.getElementById("maxIzq")?.value || 20;
    const stepXDerActual = document.getElementById("stepXDer")?.value || 27;
    const maxDerActual = document.getElementById("maxDer")?.value || 20;
    
    // 🔄 Limpiar y construir encabezado dinámico con inputs
    resultadoMindmap.innerHTML = "";

    const headerDiv = document.createElement("div");
    headerDiv.style.display = "flex";
    headerDiv.style.alignItems = "center";
    headerDiv.style.gap = "1rem";
    headerDiv.style.flexWrap = "wrap";

    const title = document.createElement("h5");
    title.textContent = "Lectura visual generada:";
    headerDiv.appendChild(title);

    // 🔘 Botones de control
    const playBtn = document.createElement("button");
    playBtn.textContent = "▶️";
    playBtn.title = "Continuar generación";
    playBtn.id = "playMindmap";
    headerDiv.appendChild(playBtn);

    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "⏸️";
    pauseBtn.title = "Pausar generación";
    pauseBtn.id = "pauseMindmap";
    headerDiv.appendChild(pauseBtn);

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "⏹️";
    stopBtn.title = "Detener generación";
    stopBtn.id = "stopMindmap";
    headerDiv.appendChild(stopBtn);

    const pngBtn = document.createElement("button");
    pngBtn.textContent = "💾 PNG";
    pngBtn.title = "Exportar como imagen PNG sin fondo";
    pngBtn.onclick = exportarCanvasComoPNG;
    headerDiv.appendChild(pngBtn);
    
    let mindmapYaGenerado = false;

    playBtn.addEventListener("click", async () => {
      estadoGeneracion = "play";
      if (!mindmapYaGenerado) {
        mindmapYaGenerado = true;
        await generarMindmapAutomatico();
      }
    });

    
    pauseBtn.addEventListener("click", () => {
      estadoGeneracion = "pause";
    });
    
    stopBtn.addEventListener("click", () => {
      estadoGeneracion = "stop";
      progresoIndexIzq = 0;
      progresoIndexDer = 0;
    });
    

    // Campo: StepX Izquierda
    headerDiv.appendChild(crearCampoInput("StepX Izq:", "stepXIzq", stepXIzqActual));
    // Campo: Max Izquierda
    headerDiv.appendChild(crearCampoInput("Max Izq:", "maxIzq", maxIzqActual));
    // Campo: StepX Derecha
    headerDiv.appendChild(crearCampoInput("StepX Der:", "stepXDer", stepXDerActual));
    // Campo: Max Derecha
    headerDiv.appendChild(crearCampoInput("Max Der:", "maxDer", maxDerActual));


    ["stepXIzq", "maxIzq", "stepXDer", "maxDer"].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("change", async () => {
          await reacomodarImagenes();
        });
      }
    });
    


    resultadoMindmap.appendChild(headerDiv);

    const canvas = document.createElement("div");
    canvas.id = "canvasMindmap";
    canvas.style.position = "relative";
    canvas.style.width = "8709px";
    canvas.style.height = "5767px";
    canvas.style.backgroundImage = "url('mindmapBackground.png')";
    canvas.style.backgroundSize = "contain";
    canvas.style.backgroundRepeat = "no-repeat";
    canvas.style.backgroundPosition = "center";
    canvas.style.margin = "1rem auto";

    resultadoMindmap.appendChild(canvas);

    canvasMindmap = canvas;


    const filas = obtenerFilasDesdeInputs();

    // 🟢 Parte izquierda (primeras 5 filas)
  let filaIndex = 0;
  while (filaIndex < 5 && estadoGeneracion !== "stop") {
    const fila = filas[filaIndex];
    let x = fila.leftStart;
    let i = 0;
    while (i < fila.max && progresoIndexIzq < palabrasIzquierda.length && estadoGeneracion !== "stop") {
      if (estadoGeneracion === "pause") {
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }

      const palabra = palabrasIzquierda[progresoIndexIzq++];
      const zigzagSteps = [0, 30, 50, 70, 100, 70, 50, 30];
      const offsetY = zigzagSteps[i % zigzagSteps.length];
      const topFinal = fila.top + offsetY;
      const offsetX = (i % 2 === 0) ? 0 : -4;
      const leftFinal = x + offsetX;
      const opcionesNombre = [
        palabra.toLowerCase(),
        palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase(),
        palabra
      ];

      let encontrada = false;
      for (const nombre of opcionesNombre) {
        try {
          const url = await getDownloadURL(ref(storage, `mindmap/${nombre}.png`));
          const img = document.createElement("img");
          img.src = url;
          img.className = "sticker";
          img.style.position = "absolute";
          img.style.top = `${topFinal}px`;
          img.style.left = `${leftFinal}px`;
          img.style.width = "30px";
          img.style.height = "30px";
          img.style.objectFit = "contain";
          const canvas = document.getElementById("canvasMindmap");
          if (canvas) {
            canvas.appendChild(img);
            hacerDraggable(img);
          }
          
          hacerDraggable(img);
          agregarBotonRotar(img);
          encontrada = true;
          break;
        } catch {}
      }

      if (!encontrada) {
        const div = document.createElement("div");
        div.textContent = palabra;
        div.classList.add("draggable-text");
        div.id = `item-${palabra}`;
        div.style.cssText = `
          position: absolute;
          top: ${topFinal}px;
          left: ${leftFinal}px;
          font-size: 11px;
          padding: 2px 6px;
          background: white;
          border: 1px dashed #ccc;
          border-radius: 6px;
          transform: translate(0px, 0px) scale(1) rotate(0deg);
          z-index: 10;
        `;
        div.dataset.x = 0;
        div.dataset.y = 0;
        div.dataset.scale = 1;
        div.dataset.angle = 0;
              
        canvas.appendChild(div);
        hacerDraggable(div);
      }
      
      
      i++;
      x += fila.stepX;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    filaIndex++;
  }


  // 🔵 Parte derecha (últimas 5 filas)
  let filaIndexDer = 0;
  while (filaIndexDer < 5 && estadoGeneracion !== "stop") {
    const fila = filas[5 + filaIndexDer];
    let x = fila.leftStart;
    let i = 0;
    while (i < fila.max && progresoIndexDer < palabrasDerecha.length && estadoGeneracion !== "stop") {
      if (estadoGeneracion === "pause") {
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }

      const palabra = palabrasDerecha[progresoIndexDer++];
      const zigzagSteps = [0, 30, 50, 70, 100, 70, 50, 30];
      const offsetY = zigzagSteps[i % zigzagSteps.length];
      const topFinal = fila.top + offsetY;
      const offsetX = (i % 2 === 0) ? 0 : -4;
      const leftFinal = x + offsetX;

      const opcionesNombre = [
        palabra.toLowerCase(),
        capitalizar(palabra),
        palabra
      ];

      let encontrada = false;
      for (const nombre of opcionesNombre) {
        try {
          const url = await getDownloadURL(ref(storage, `mindmap/${nombre}.png`));
          const img = document.createElement("img");
          img.src = url;
          img.className = "sticker";
          img.style = `position:absolute; top:${topFinal}px; left:${leftFinal}px; width:30px; height:30px; object-fit:contain;`;
          const canvas = document.getElementById("canvasMindmap");
          if (canvas) {
            canvas.appendChild(img);
            hacerDraggable(img);
          }
          
          hacerDraggable(img);
          agregarBotonRotar(img);
          encontrada = true;
          break;
        } catch {}
      }

      if (!encontrada) {
        const div = document.createElement("div");
        div.textContent = palabra;
        div.classList.add("draggable-text");
        div.id = `item-${palabra}`;
        div.style.cssText = `
          position: absolute;
          top: ${topFinal}px;
          left: ${leftFinal}px;
          font-size: 11px;
          padding: 2px 6px;
          background: white;
          border: 1px dashed #ccc;
          border-radius: 6px;
          transform: translate(0px, 0px) scale(1) rotate(0deg);
          z-index: 10;
        `;
        div.dataset.x = 0;
        div.dataset.y = 0;
        div.dataset.scale = 1;
        div.dataset.angle = 0;
      
        canvas.appendChild(div);
        hacerDraggable(div);
      }
      
      i++;
      x += fila.stepX;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    filaIndexDer++;
  }


  const unidadSelect = document.getElementById("compartirUnidad");
  if (unidadSelect) {
    for (let i = 1; i <= 15; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      unidadSelect.appendChild(option);
    }
  }

}


function obtenerFilasDesdeInputs() {
  const stepXIzq = parseInt(document.getElementById("stepXIzq")?.value) || 27;
  const maxIzq = parseInt(document.getElementById("maxIzq")?.value) || 20;
  const stepXDer = parseInt(document.getElementById("stepXDer")?.value) || 27;
  const maxDer = parseInt(document.getElementById("maxDer")?.value) || 20;

  return [
    // IZQUIERDA
    { top: 40, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    { top: 200, leftStart: 540, stepX: -stepXIzq, max: maxIzq },
    { top: 360, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    { top: 520, leftStart: 540, stepX: -stepXIzq, max: maxIzq },
    { top: 680, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    // DERECHA
    { top: 40, leftStart: 680, stepX: stepXDer, max: maxDer },
    { top: 200, leftStart: 1220, stepX: -stepXDer, max: maxDer },
    { top: 360, leftStart: 680, stepX: stepXDer, max: maxDer },
    { top: 520, leftStart: 1220, stepX: -stepXDer, max: maxDer },
    { top: 680, leftStart: 680, stepX: stepXDer, max: maxDer }
  ];
}


  let imagenSeleccionada = null;

  const inputMultiple = document.getElementById("inputMultipleImagenes");
  const modal = document.getElementById("modalNombreImagen");
  const nombreInput = document.getElementById("nombreImagenInput");
  const confirmarBtn = document.getElementById("confirmarNombreImagen");
  const cancelarBtn = document.getElementById("cancelarNombreImagen");


  inputMultiple.addEventListener("change", async (e) => {
    const archivos = e.target.files;
    if (!archivos.length) return;
  
    for (let archivo of archivos) {
      const nombre = archivo.name.replace(/\.[^/.]+$/, ""); // Quita extensión
      const reader = new FileReader();
  
      reader.onloadend = async () => {
        try {
          const dataURL = reader.result;
          const refImg = ref(storage, `mindmap/${nombre}.png`);
          await uploadString(refImg, dataURL, "data_url");
        } catch (err) {
        }
      };
  
      reader.readAsDataURL(archivo);
      await new Promise((res) => setTimeout(res, 300)); // Espera entre cargas para evitar saturación
    }
  
    alert("✅ Todas las imágenes han sido subidas.");
    cargarImagenesGuardadas(document.getElementById("contenedorGuardadasManual")); // refresca la galería si existe
  });
  
  // Confirmar subida
  confirmarBtn.addEventListener("click", async () => {
    const nombre = nombreInput.value.trim().toLowerCase();
    
    if (!nombre || !imagenSeleccionada) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const dataURL = reader.result;
        const refImg = ref(storage, `mindmap/${nombre.toLowerCase()}.png`);
        await uploadString(refImg, dataURL, "data_url");
        alert(`✅ Imagen "${nombre}" subida correctamente.`);
        modal.style.display = "none";
        imagenSeleccionada = null;
        cargarImagenesGuardadas(document.getElementById("contenedorGuardadasManual"));
      } catch (err) {
        alert("❌ No se pudo subir la imagen.");
      }
    };
    reader.readAsDataURL(imagenSeleccionada);
  });

  // Cancelar subida
  cancelarBtn.addEventListener("click", () => {
    modal.style.display = "none";
    imagenSeleccionada = null;
  });

  const verGaleriaBtn = document.getElementById("verGaleriaBtn");
  const modalGaleria = document.getElementById("modalGaleriaImagenes");
  const cerrarGaleriaBtn = document.getElementById("cerrarModalGaleria");
  const galeriaContainer = document.getElementById("contenedorGuardadasManual");
  
  if (verGaleriaBtn && modalGaleria && cerrarGaleriaBtn) {
    verGaleriaBtn.addEventListener("click", () => {
      modalGaleria.style.display = "flex";
      cargarImagenesGuardadas(galeriaContainer);
    });
  
    cerrarGaleriaBtn.addEventListener("click", () => {
      modalGaleria.style.display = "none";
    });
  }

});

async function reacomodarImagenes() {
  estadoGeneracion = "pause"; // 🔴 Pausa cualquier generación en curso
  await new Promise(resolve => setTimeout(resolve, 100)); // espera un tick

  if (!canvasMindmap) return;

  canvasMindmap.innerHTML = ""; // Limpia el canvas

  const stepXIzq = parseInt(document.getElementById("stepXIzq").value) || 27;
  const maxIzq = parseInt(document.getElementById("maxIzq").value) || 20;
  const stepXDer = parseInt(document.getElementById("stepXDer").value) || 27;
  const maxDer = parseInt(document.getElementById("maxDer").value) || 20;

  const filas = [
    { top: 40, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    { top: 200, leftStart: 540, stepX: -stepXIzq, max: maxIzq },
    { top: 360, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    { top: 520, leftStart: 540, stepX: -stepXIzq, max: maxIzq },
    { top: 680, leftStart: 40, stepX: stepXIzq, max: maxIzq },
    { top: 40, leftStart: 680, stepX: stepXDer, max: maxDer },
    { top: 200, leftStart: 1220, stepX: -stepXDer, max: maxDer },
    { top: 360, leftStart: 680, stepX: stepXDer, max: maxDer },
    { top: 520, leftStart: 1220, stepX: -stepXDer, max: maxDer },
    { top: 680, leftStart: 680, stepX: stepXDer, max: maxDer }
  ];

  const renderPalabras = async (palabras, filaInicio, filas) => {
    let index = 0;
    for (const fila of filas.slice(filaInicio, filaInicio + 5)) {
      let x = fila.leftStart;
      for (let i = 0; i < fila.max && index < palabras.length; i++) {
        const palabra = palabras[index++];
        const zigzagSteps = [0, 30, 50, 70, 100, 70, 50, 30];
        const offsetY = zigzagSteps[i % zigzagSteps.length];
        const topFinal = fila.top + offsetY;
        const offsetX = (i % 2 === 0) ? 0 : -4;
        const leftFinal = x + offsetX;
  
        const opcionesNombre = [
          palabra.toLowerCase(),
          palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase(),
          palabra
        ];
  
        let encontrada = false;
  
        for (const nombre of opcionesNombre) {
          try {
            const url = await getDownloadURL(ref(storage, `mindmap/${nombre}.png`));
            const img = document.createElement("img");
            img.src = url;
            img.className = "sticker";
            img.style.position = "absolute";
            img.style.top = `${topFinal}px`;
            img.style.left = `${leftFinal}px`;
            img.style.width = "30px";
            img.style.height = "30px";
            img.style.objectFit = "contain";
  
            img.id = `item-${palabra}`;
            canvasMindmap.appendChild(img);
            hacerDraggable(img);
            agregarBotonRotar(img);
            encontrada = true;
            break;
          } catch {}
        }
  
        if (!encontrada) {
          const div = document.createElement("div");
          div.textContent = palabra;
          div.classList.add("draggable-text");
          div.id = `item-${palabra}`;
  
          div.style.cssText = `
            position: absolute;
            top: ${obj.top}px;
            left: ${obj.left}px;
            font-size: 11px;
            padding: 2px 6px;
            background: white;
            border: 1px dashed #ccc;
            border-radius: 6px;
            transform: translate(${obj.x}px, ${obj.y}px) scale(${obj.scale}) rotate(${obj.angle}deg);
          `;
          
  
          canvasMindmap.appendChild(div);
          hacerDraggable(div);
        }
  
        x += fila.stepX;
      }
    }
  };
  
  renderPalabras(palabrasIzquierdaGlobal, 0, 0);
  renderPalabras(palabrasDerechaGlobal, 5, 5);
}


function hacerDraggable(elemento) {
  // Asegura que se pueda mover y transformar
  elemento.style.position = "absolute";
  elemento.style.touchAction = "none";
  elemento.style.userSelect = "none";
  elemento.style.cursor = "grab";
  elemento.dataset.x = 0;
  elemento.dataset.y = 0;
  elemento.dataset.scale = 1;
  elemento.dataset.angle = 0;

  // 👇 Prevenir menú contextual con clic derecho
  elemento.addEventListener("contextmenu", e => e.preventDefault());

  interact(elemento)
    .draggable({
      // ✅ Escuchar botón izquierdo o derecho
      pointerEvents: { allowFrom: elemento, hold: 0, buttons: 1 | 2 },
      listeners: {
        move(event) {
          const target = event.target;
          let x = (parseFloat(target.dataset.x) || 0) + event.dx;
          let y = (parseFloat(target.dataset.y) || 0) + event.dy;
          const scale = parseFloat(target.dataset.scale) || 1;
          const angle = parseFloat(target.dataset.angle) || 0;

          target.dataset.x = x;
          target.dataset.y = y;
          target.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`;
          triggerAutosave();
        }
      }
    })
    .resizable({
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move(event) {
          const target = event.target;
          let x = parseFloat(target.dataset.x) || 0;
          let y = parseFloat(target.dataset.y) || 0;
          const scale = parseFloat(target.dataset.scale) || 1;
          const angle = parseFloat(target.dataset.angle) || 0;

          Object.assign(target.style, {
            width: `${event.rect.width}px`,
            height: `${event.rect.height}px`,
            transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`
          });

          x += event.deltaRect.left;
          y += event.deltaRect.top;
          target.dataset.x = x;
          target.dataset.y = y;
        }
      }
    })
    .gesturable({
      listeners: {
        move(event) {
          const target = event.target;
          const scale = (parseFloat(target.dataset.scale) || 1) * (1 + event.ds);
          const angle = (parseFloat(target.dataset.angle) || 0) + event.da;
          const x = parseFloat(target.dataset.x) || 0;
          const y = parseFloat(target.dataset.y) || 0;

          target.dataset.scale = scale;
          target.dataset.angle = angle;

          target.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`;
          triggerAutosave();

        }
      }
    });
}


function crearCampoInput(labelTexto, id, valorPorDefecto) {
  const div = document.createElement("div");

  const label = document.createElement("label");
  label.innerHTML = `<strong>${labelTexto}</strong>`;

  const input = document.createElement("input");
  input.type = "number";
  input.id = id;
  input.value = valorPorDefecto;
  input.style.width = "100px";
  input.style.marginLeft = "0.5rem";

  div.appendChild(label);
  div.appendChild(input);

  return div;
}


function capitalizar(palabra) {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}


async function obtenerUrlImagenConVariantes(nombre) {
  const variantes = [
    nombre,
    nombre.toLowerCase(),
    nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase(), // Capitalizada
    nombre.toUpperCase()
  ];

  for (const variante of variantes) {
    const refImg = ref(storage, `mindmap/${variante}.png`);
    try {
      const url = await getDownloadURL(refImg);
      return url;
    } catch (e) {
      // No encontrada, sigue a la siguiente variante
    }
  }

  return null; // No se encontró ninguna variante
}


async function exportarCanvasComoPNG() {
  const div = document.getElementById("canvasMindmap");

  // Medidas base del div (en píxeles)
  const width = div.offsetWidth;
  const height = div.offsetHeight;

  // Escala para 300 DPI (suponiendo que el original es 72 DPI)
  const scaleFactor = 300 / 72;

  // Canvas con resolución aumentada
  const canvas = document.createElement("canvas");
  canvas.width = width * scaleFactor;
  canvas.height = height * scaleFactor;

  const ctx = canvas.getContext("2d");
  ctx.scale(scaleFactor, scaleFactor); // Escalar antes de dibujar

  ctx.clearRect(0, 0, width, height); // Área visible

  const elements = div.querySelectorAll("img, div.draggable-text");

  for (const el of elements) {
    const left = parseInt(el.style.left || 0);
    const top = parseInt(el.style.top || 0);
    const scale = parseFloat(el.dataset.scale) || 1;
    const angle = parseFloat(el.dataset.angle) || 0;
    const x = parseFloat(el.dataset.x) || 0;
    const y = parseFloat(el.dataset.y) || 0;

    const finalX = left + x;
    const finalY = top + y;

    ctx.save();
    ctx.translate(finalX, finalY);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(scale, scale);

    if (el.tagName === "IMG") {
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ctx.drawImage(img, 0, 0, el.width, el.height);
          resolve();
        };
        img.src = el.src;
      });
    } else if (el.classList.contains("draggable-text")) {
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#000";
      ctx.fillText(el.textContent, 0, 12);
    }

    ctx.restore();
  }

  // Descargar con resolución 300dpi
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lecturaVisual_300dpi.png";
    a.click();
  }, "image/png");
}



document.addEventListener('wheel', function (e) {
  if (!e.target.classList.contains('sticker')) return;
  if (!e.shiftKey) return; // solo si Shift está presionado

  const target = e.target;
  let angle = parseFloat(target.dataset.angle) || 0;
  angle += e.deltaY > 0 ? 5 : -5; // rueda arriba = rotar izq, abajo = der
  target.dataset.angle = angle;

  const x = parseFloat(target.dataset.x) || 0;
  const y = parseFloat(target.dataset.y) || 0;
  const scale = parseFloat(target.dataset.scale) || 1;

  target.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`;
});


function agregarBotonRotar(elemento) {
  const btn = document.createElement("button");
  btn.textContent = "↻";
  btn.style.position = "absolute";
  btn.style.right = "0";
  btn.style.top = "-20px";
  btn.style.fontSize = "12px";
  btn.style.padding = "2px";
  btn.style.zIndex = 9999;

  btn.onclick = (e) => {
    e.stopPropagation();
    let angle = parseFloat(elemento.dataset.angle) || 0;
    angle += 15;
    elemento.dataset.angle = angle;
    const x = parseFloat(elemento.dataset.x) || 0;
    const y = parseFloat(elemento.dataset.y) || 0;
    const scale = parseFloat(elemento.dataset.scale) || 1;
    elemento.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`;
    triggerAutosave();
  };

  elemento.parentElement?.appendChild(btn);
}




async function guardarMindMapEnFirebase(nombreMapa) {
  const user = auth.currentUser;
  if (!user) {
    alert("Inicia sesión para guardar.");
    return;
  }

  const canvas = document.getElementById("canvasMindmap");
  const elementos = [...canvas.querySelectorAll("img, .draggable-text")];

  const contenido = elementos.map(el => ({
    palabra: el.textContent || el.alt || "imagen",
    tipo: el.tagName === "IMG" ? "imagen" : "texto",
    x: parseFloat(el.dataset.x || 0),
    y: parseFloat(el.dataset.y || 0),
    scale: parseFloat(el.dataset.scale || 1),
    angle: parseFloat(el.dataset.angle || 0),
    top: parseFloat(el.style.top),
    left: parseFloat(el.style.left),
    src: el.tagName === "IMG" ? el.src : null
  }));

  const db = getFirestore(app);
  await addDoc(collection(db, "mindmaps"), {
    uid: user.uid,
    nombre: nombreMapa,
    creado: new Date(),
    contenido
  });


  alert("✅ MindMap guardado en Firebase.");
}


async function cargarMindMapsGuardados() {
  const user = auth.currentUser;
  if (!user) return;

  const db = getFirestore(app);
  const q = query(
    collection(getFirestore(app), "mindmaps"),
    where("uid", "==", user.uid),
    orderBy("creado", "desc")
  );
  
  const snapshot = await getDocs(q);
  

  const lista = document.getElementById("listaMindmaps");
  lista.innerHTML = "";

  snapshot.forEach(docSnap => {
    const { nombre, contenido } = docSnap.data();
    const id = docSnap.id;
  
    const card = document.createElement("div");
    card.className = "mindmap-item";
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      transition: background 0.2s;
    `;
    card.onmouseover = () => card.style.background = "#e2e8f0";
    card.onmouseout = () => card.style.background = "#f1f5f9";

    const titulo = document.createElement("span");
    titulo.textContent = nombre;
    titulo.style.cursor = "pointer";
    titulo.style.flex = "1";
    titulo.onclick = () => renderizarMindmap(contenido);
  
    const eliminarBtn = document.createElement("button");
    eliminarBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
    eliminarBtn.title = "Eliminar";
    eliminarBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #dc2626;
      font-size: 18px;
      cursor: pointer;
    `;

  
    eliminarBtn.onclick = async () => {
      const confirmacion = confirm(`¿Seguro que quieres eliminar "${nombre}"?`);
      if (!confirmacion) return;
  
      const db = getFirestore(app);
      await deleteDoc(doc(collection(db, "mindmaps"), id));
      await cargarMindMapsGuardados();
    };
  
    card.appendChild(titulo);
    card.appendChild(eliminarBtn);
    lista.appendChild(card);
  });
  
}

function renderizarMindmap(contenido) {
  const canvas = document.getElementById("canvasMindmap");
  canvas.innerHTML = "";

  contenido.forEach(obj => {
    if (obj.tipo === "imagen") {
      const img = document.createElement("img");
      img.src = obj.src;
      img.className = "sticker";
      Object.assign(img.style, {
        position: "absolute",
        top: `${obj.top}px`,
        left: `${obj.left}px`,
        width: "30px",
        height: "30px",
        objectFit: "contain",
        transform: `translate(${obj.x}px, ${obj.y}px) scale(${obj.scale}) rotate(${obj.angle}deg)`
      });
      

      Object.assign(img.dataset, obj);
      img.style.transform = `translate(${obj.x || 0}px, ${obj.y || 0}px) scale(${obj.scale || 1}) rotate(${obj.angle || 0}deg)`;
      canvas.appendChild(img);
      hacerDraggable(img);
      agregarBotonRotar(img);
            
      hacerDraggable(img);
      agregarBotonRotar(img);
    } else {
      const div = document.createElement("div");
      div.textContent = obj.palabra;
      div.className = "draggable-text";
      div.style.cssText = `
        position: absolute;
        top: ${obj.top}px;
        left: ${obj.left}px;
        font-size: 11px;
        padding: 2px 6px;
        background: white;
        border: 1px dashed #ccc;
        border-radius: 6px;
        transform: translate(${obj.x}px, ${obj.y}px) scale(${obj.scale}) rotate(${obj.angle}deg);
      `;

      Object.assign(div.dataset, obj);
      div.style.transform = `translate(${obj.x || 0}px, ${obj.y || 0}px) scale(${obj.scale || 1}) rotate(${obj.angle || 0}deg)`;
      canvas.appendChild(div);
      hacerDraggable(div);

    }
  });
}



document.addEventListener("contextmenu", async (e) => {
  if (!e.target.classList.contains("draggable-text")) return;

  e.preventDefault();
  const palabra = e.target.textContent.trim().toLowerCase();
  const url = await obtenerUrlImagenConVariantes(palabra);
  if (!url) {
    alert(`⚠️ No se encontró una imagen para "${palabra}" en Firebase.`);
    return;
  }

  // Crear imagen y reemplazar
  const nuevaImg = document.createElement("img");
  nuevaImg.src = url;
  nuevaImg.className = "sticker";
  Object.assign(nuevaImg.style, {
    position: "absolute",
    top: e.target.style.top,
    left: e.target.style.left,
    width: "30px",
    height: "30px",
    objectFit: "contain"
  });

  // Copia datos
  Object.assign(nuevaImg.dataset, e.target.dataset);

  const canvas = document.getElementById("canvasMindmap");
  canvas.replaceChild(nuevaImg, e.target);
  hacerDraggable(nuevaImg);
  agregarBotonRotar(nuevaImg);
});


document.addEventListener("click", (e) => {
  if (e.target.closest("#btnGuardarMindMap")) {
    document.getElementById("modalNombreMindmap").style.display = "flex";
    document.getElementById("inputNombreMindmap").value = "";
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const confirmarBtn = document.getElementById("confirmarGuardarMindmap");
  const modal       = document.getElementById("modalNombreMindmap");

  if (confirmarBtn) {
    confirmarBtn.addEventListener("click", async () => {
      const nombre = document.getElementById("inputNombreMindmap").value.trim();
      if (!nombre) {
        alert("⚠️ Debes escribir un nombre.");
        return;
      }
      await guardarMindMapEnFirebase(nombre);
      if (modal) modal.style.display = "none";
    });
  }
});


document.getElementById("cancelarGuardarMindmap").addEventListener("click", () => {
  document.getElementById("modalNombreMindmap").style.display = "none";
});


document.getElementById("btnVerMindMaps").addEventListener("click", () => {
  const panel = document.getElementById("panelLecturasGuardadas");
  panel.style.display = "block";
  cargarMindMapsGuardados();
});



// Crear menú contextual
const menuContextual = document.createElement("div");
menuContextual.id = "menuContextualPalabra";
menuContextual.style.position = "absolute";
menuContextual.style.display = "none";
menuContextual.style.background = "white";
menuContextual.style.border = "1px solid #ccc";
menuContextual.style.padding = "0.5rem";
menuContextual.style.borderRadius = "6px";
menuContextual.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
menuContextual.innerHTML = `<button id="reemplazarConImagen">🔄 Reemplazar por imagen</button>`;
document.body.appendChild(menuContextual);

let palabraSeleccionada = null;
let elementoOriginal = null;

document.addEventListener("contextmenu", async (e) => {
  if (!e.target.classList.contains("draggable-text")) return;

  e.preventDefault();
  palabraSeleccionada = e.target.textContent.trim().toLowerCase();
  elementoOriginal = e.target;

  // Mostrar menú contextual en la posición del clic
  menuContextual.style.left = `${e.pageX}px`;
  menuContextual.style.top = `${e.pageY}px`;
  menuContextual.style.display = "block";
});

document.addEventListener("click", () => {
  menuContextual.style.display = "none";
});

document.getElementById("reemplazarConImagen").addEventListener("click", async () => {
  const url = await obtenerUrlImagenConVariantes(palabraSeleccionada);
  if (!url) {
    alert(`⚠️ No se encontró una imagen para "${palabraSeleccionada}" en Firebase.`);
    return;
  }

  const nuevaImg = document.createElement("img");
  nuevaImg.src = url;
  nuevaImg.className = "sticker";
  Object.assign(nuevaImg.style, {
    position: "absolute",
    top: elementoOriginal.style.top,
    left: elementoOriginal.style.left,
    width: "30px",
    height: "30px",
    objectFit: "contain"
  });
  Object.assign(nuevaImg.dataset, elementoOriginal.dataset);

  const canvas = document.getElementById("canvasMindmap");
  canvas.replaceChild(nuevaImg, elementoOriginal);
  hacerDraggable(nuevaImg);
  agregarBotonRotar(nuevaImg);
  menuContextual.style.display = "none";
});


function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}


async function autoguardarMindMap() {
  const user = auth.currentUser;
  if (!user || !canvasMindmap) return;

  const elementos = [...canvasMindmap.querySelectorAll("img, .draggable-text")];

  const contenido = elementos.map(el => ({
    palabra: el.textContent || el.alt || "imagen",
    tipo: el.tagName === "IMG" ? "imagen" : "texto",
    x: parseFloat(el.dataset.x || 0),
    y: parseFloat(el.dataset.y || 0),
    scale: parseFloat(el.dataset.scale || 1),
    angle: parseFloat(el.dataset.angle || 0),
    top: parseFloat(el.style.top),
    left: parseFloat(el.style.left),
    src: el.tagName === "IMG" ? el.src : null
  }));

  const db = getFirestore(app);

  // Actualiza el documento más reciente del usuario
  const q = query(
    collection(db, "mindmaps"),
    where("uid", "==", user.uid),
    orderBy("creado", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const docRef = snapshot.docs[0].ref;
    await updateDoc(docRef, { contenido });
  }
}

const triggerAutosave = debounce(autoguardarMindMap, 1000);







  


document.addEventListener("DOMContentLoaded", async () => {
  const modalEl = document.getElementById("modalGenerarAudio");
  const btnAudio = document.getElementById("btnAbrirModalAudio");
  const btnGenerarAudio = document.getElementById("btnGenerarAudioFinal");

  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('tts-loading-progress', (_, progress) => {
      const btn = document.getElementById("btnGenerarAudioFinal");
      if (btn && !modelLoadedInternamente) {
        const porcentaje = Math.floor(progress * 100);
        btn.innerText = `⏳ Cargando modelo... (${porcentaje}%)`;
      }
    });
  
    window.electron.ipcRenderer.on('tts-ready', () => {
      const btn = document.getElementById("btnGenerarAudioFinal");
      modelLoadedInternamente = true;
      if (btn) {
        btn.disabled = false;
        btn.innerText = "🎧 Generar Audio";
      }
    });
  }
  

  if (!modalEl || !btnAudio || !btnGenerarAudio) {
    return;
  }

  let audioQueue = Promise.resolve();

  // Verifica si el modelo TTS está listo al inicio
  verificarModeloTTS();

  // Abrir modal
  btnAudio.addEventListener("click", () => {
    try {
      const parte1 = document.getElementById("textoMindmapParte1")?.value.trim() || "";
      const parte2 = document.getElementById("textoMindmapParte2")?.value.trim() || "";
      document.getElementById("textoFinalAudio").value = `${parte1}\n\n${parte2}`;
      resetAudioPlayer();
      modalAudio.show();
    } catch (error) {
    }
  });

  btnGenerarAudio.addEventListener("click", () => {
    audioQueue = audioQueue.then(async () => {
      await handleAudioGeneration();
    }).catch(error => {
    });
  });

  async function verificarModeloTTS() {
    if (!window.electronAPI?.isTTSModelReady) return;

    const isReady = await window.electronAPI.isTTSModelReady();
    if (!isReady) {
      btnGenerarAudio.disabled = true;
      btnGenerarAudio.innerText = "⏳ Cargando modelo...";
      const intervalo = setInterval(async () => {
        const listo = await window.electronAPI.isTTSModelReady();
        if (listo) {
          clearInterval(intervalo);
          btnGenerarAudio.disabled = false;
          btnGenerarAudio.innerText = "🎧 Generar Audio";
        }
      }, 1000);
    }
  }

  async function handleAudioGeneration() {
    const texto = document.getElementById("textoFinalAudio").value.trim();
    const velocidad = document.getElementById("velocidadVoz")?.value || "normal";
    const tono = document.getElementById("tonoVoz")?.value || "neutral";
    const modeloSeleccionado = document.getElementById("modeloTTS")?.value;

    if (!texto) {
      showAlert("⚠️ Por favor ingresa un texto para generar audio.");
      return;
    }

    if (texto.length > 1000) {
      showAlert("⚠️ El texto es demasiado largo. Máximo 1000 caracteres.");
      return;
    }

    setLoadingState(true);
    resetAudioPlayer();

    try {
      const audioBlob = await generateLocalTTS({
        text: texto,
        model: modeloSeleccionado,
        speed: getSpeedValue(velocidad),
        tone: tono
      });

      playGeneratedAudio(audioBlob);
    } catch (error) {
      showAlert(`❌ Error al generar audio: ${error.message || "Por favor intenta nuevamente"}`);
    } finally {
      setLoadingState(false);
    }
  }




  function resetAudioPlayer() {
    const audioPreview = document.getElementById("audioPreview");
    const audioElement = document.getElementById("audioGenerado");
    if (audioPreview && audioElement) {
      audioPreview.style.display = "none";
      audioElement.src = "";
      audioElement.load();
    }
  }

  function playGeneratedAudio(audioBlob) {
    const audioPreview = document.getElementById("audioPreview");
    const audioElement = document.getElementById("audioGenerado");

    if (!audioPreview || !audioElement) {
      throw new Error("Elementos de audio no encontrados");
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;
    audioPreview.style.display = "block";

    audioElement.onerror = () => {
      showAlert("❌ Error al reproducir el audio generado");
    };

    audioElement.play().catch(e => {
      showAlert("⚠️ El audio se generó pero no se pudo reproducir automáticamente");
    });
  }

  function setLoadingState(isLoading) {
    btnGenerarAudio.disabled = isLoading;
    btnGenerarAudio.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm" role="status"></span> Generando...'
      : "🎧 Generar Audio";
  }

  function showAlert(message) {
    alert(message);
  }

  function getSpeedValue(velocidad) {
    const speedMap = {
      "lenta": 0.8,
      "normal": 1.0,
      "rapida": 1.2
    };
    return speedMap[velocidad] || 1.0;
  }
});
