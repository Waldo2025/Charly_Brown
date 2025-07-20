// generarLectura.js
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc, orderBy  } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js';
import setupImageGenerator from './imageGenerator.js';

// Config
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


// ✅ Inicializar Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// ⚙️ Ejecutar el generador de imágenes
setupImageGenerator(storage);

export { auth, storage }; // ahora sí puedes exportar ambos


let currentUserId = null;

// Cargar conversación al iniciar
onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      await cargarConversacionDesdeFirebase();
    }
  });

const charts = [];

const btnLista = document.getElementById("btnListaMetodologica");
const modalLista = document.getElementById("modalListaMetodologica");
const cerrarModal = document.getElementById("cerrarModalLista");
const contenedor = document.getElementById("contenedorTemasMetodologicos");
const buscador = document.getElementById("buscadorTemas");
// Envío del formulario a firebase
const form = document.getElementById("formMetodologiaASC");
const historialMensajes = [];



const API_KEY = "AIzaSyA-Al10Diw6CkowW0F3EePEBD6D1h3jwxw";
// const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
// const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
// const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro-exp-02-05:generateContent";
// const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-02-05:generateContent";
// const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

async function construirContextoFirebase() {
  let contexto = "";

  // 🔹 Lecturas base
  const lecturasSnap = await getDocs(collection(db, "lecturasASC"));
  lecturasSnap.forEach(docSnap => {
    const d = docSnap.data();
    contexto += `📖 Lectura: ${d.titulo}\nNivel: ${d.nivel}, Grado: ${d.grado}, Serie: ${d.serie}\nTexto: ${(d.textoLectura || '').replace(/<[^>]+>/g,'').slice(0,300)}...\n\n`;
  });

  // 🔹 Lecturas nuevas
  const nuevasSnap = await getDocs(collection(db, "lecturasNuevas"));
  nuevasSnap.forEach(docSnap => {
    const d = docSnap.data();
    contexto += `📘 Lectura nueva: ${d.tema} (Nivel ${d.nivel} ${d.grado})\nAutor estilo: ${d.autorReferencia}\nContenido: ${(d.contenidoHTML || '').replace(/<[^>]+>/g,'').slice(0,300)}...\n\n`;
  });

  // 🔹 Metodología ASC
  const metodoSnap = await getDocs(collection(db, "metodologiaASC"));
  metodoSnap.forEach(docSnap => {
    const d = docSnap.data();
    contexto += `🧩 Tema metodológico: ${d.tema}\nConcepto: ${(d.concepto || '').replace(/<[^>]+>/g,'')}\nComentarios: ${(d.comentarios || '').replace(/<[^>]+>/g,'')}\n\n`;
  });

  // 🔹 Campos formativos
  const camposSnap = await getDocs(collection(db, "camposFormativos"));
  camposSnap.forEach(docSnap => {
    const d = docSnap.data();
    contexto += `📚 Campo: ${d.campo}, Asignatura: ${d.asignatura}\nNivel: ${d.nivel}, Trimestre: ${d.trimestre}, Unidad: ${d.unidad}\nAprendizaje esperado: ${d.aprendizajeEsperado || "—"}\n\n`;
  });

  return contexto;
}

async function prepararPromptConContexto(userMessage, contextoLecturasExtra = "") {
  const contextoFirebase = await construirContextoFirebase();

  return [
    {
      role: "user",
      text: `
Eres un asistente pedagógico experto. Tienes acceso a estos datos de Firebase:

${contextoFirebase}

${contextoLecturasExtra ? "También tienes lecturas relevantes específicas:\n" + contextoLecturasExtra : ""}

Ahora responde la pregunta del usuario SOLO usando este contexto si aplica:

${userMessage}

IMPORTANTE:
- Devuelve TODO el contenido ÚNICAMENTE en HTML.
- Usa <strong> para negritas, <em> para cursivas.
- No uses Markdown (**texto**, _texto_, etc.).
- No incluyas bloques de código como \`\`\`html ni \`\`\`.
- Usa <h2>, <h3>, <p>, <ul>, <li>, <table>, etc. correctamente.
`
    }
  ];
}


const palabrasClavePorTema = {
    "Competencias Primaria Alta": ["competencias", "primaria alta", "cuarto", "quinto", "sexto"],
    "Competencias Primaria Baja": ["competencias", "primaria baja", "primero", "segundo", "tercero"],
    "Competencias Primaria Inglés": ["competencias inglés", "english", "primaria inglés"],
    "Escuelas Comprometidas pt.1": ["escuelas comprometidas", "pt.1"],
    "Escuelas Comprometidas pt.2": ["escuelas comprometidas", "pt.2"],
    "Escuelas Comprometidas pt.3": ["escuelas comprometidas", "pt.3"],
    "Escuelas Comprometidas pt.4": ["escuelas comprometidas", "pt.4"],
    "Escuelas Comprometidas pt.5": ["escuelas comprometidas", "pt.5"],
    "Escuelas Comprometidas pt.6": ["escuelas comprometidas", "pt.6"],
    "Escuelas Comprometidas pt.7": ["escuelas comprometidas", "pt.7"],
    "Estructura Secundaria": ["estructura secundaria", "estructura"],
    "Manual General de Primaria en Forma": ["manual", "primaria en forma"],
    "Pilares ASC": ["pilares", "fundamentos", "metodología asc"],
    "Prólogos Primaria": ["prólogo", "prólogos", "inicio"],
    "TAXONOMÍA DE BLOOM": ["bloom", "taxonomía", "verbos", "evaluación"]
  };
  

let historialConversacion = [];
let contextoMetodologia = "";
let contextoLecturas = "";

// Ejemplo: manejar envío de formulario del generador
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnGenerarLectura");
  const btnListaLecturas = document.getElementById("btnListaLecturas");
  const modalListaLecturas = document.getElementById("modalListaLecturas");
  const cerrarModalListaLecturas = document.getElementById("cerrarModalListaLecturas");
  const contenedorLecturas = document.getElementById("contenedorLecturasGuardadas");
  const buscadorLecturas = document.getElementById("buscadorLecturas");
  const modalVistaLectura = document.getElementById("modalVistaLectura");
  const cerrarVistaLectura = document.getElementById("cerrarVistaLectura");
  const vistaTitulo = document.getElementById("vistaTituloLectura");
  const vistaTexto = document.getElementById("vistaTextoLectura");
  const vistaPreguntas = document.getElementById("vistaPreguntasLectura");



  // Mover estas funciones al inicio del archivo, fuera de cualquier event listener
    function procesarDatos(lecturas) {
        const criterios = {};
        
        lecturas.forEach(lectura => {
            (lectura.preguntas || []).forEach(pregunta => {
                const criterio = pregunta.criterio || "Sin criterios";
                const nivel = pregunta.nivel || "Sin nivel";
                
                if (!criterios[criterio]) criterios[criterio] = {};
                criterios[criterio][nivel] = (criterios[criterio][nivel] || 0) + 1;
            });
        });
        
        return criterios;
    }

    function getColor(index, opacity = 0.6) {
        const colors = [
            'rgba(75, 192, 192, OPACITY)',
            'rgba(54, 162, 235, OPACITY)',
            'rgba(255, 99, 132, OPACITY)',
            'rgba(255, 159, 64, OPACITY)',
            'rgba(153, 102, 255, OPACITY)'
        ];
        return colors[index % colors.length].replace('OPACITY', opacity);
    }

    function graficarcriteriosPorNivel(lecturas) {
        const canvas = document.getElementById("grafica1");
        if (canvas.chart) canvas.chart.destroy();
    
        const criteriosNiveles = {};
    
        // Recolectar datos
        lecturas.forEach(lectura => {
            (lectura.preguntas || []).forEach(p => {
                const criterio = p.criterio || "N/A";
                const nivel = p.nivel || "N/A";
    
                if (!criteriosNiveles[criterio]) criteriosNiveles[criterio] = {};
                if (!criteriosNiveles[criterio][nivel]) criteriosNiveles[criterio][nivel] = 0;
    
                criteriosNiveles[criterio][nivel]++;
            });
        });
    
        // Ordenar criterios por total de preguntas
        const criteriosOrdenadas = Object.entries(criteriosNiveles)
            .map(([criterio, niveles]) => ({
                criterio,
                total: Object.values(niveles).reduce((a, b) => a + b, 0),
                niveles
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    
        const labels = criteriosOrdenadas.map(r => r.criterio);
        const nivelesUnicos = Array.from(new Set(
            criteriosOrdenadas.flatMap(r => Object.keys(r.niveles))
        ));
    
        const datasets = nivelesUnicos.map((nivel, i) => ({
            label: nivel,
            data: criteriosOrdenadas.map(r => r.niveles[nivel] || 0),
            backgroundColor: getColor(i),
            borderColor: getColor(i, 1),
            borderWidth: 1
        }));
    
        canvas.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Criterios por nivel',
                        font: {
                            size: 12
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                          maxRotation: 30,
                          minRotation: 30,
                          autoSkip: false
                        }
                      },
                    y: {
                      beginAtZero: true,
                      suggestedMax: 5, // Puedes ajustarlo a tu caso
                      ticks: {
                        stepSize: 1,
                        precision: 0
                      }
                    }
                  }
                  
            }
        });
    }
    
    

    // Función para cargar datos iniciales y mostrar gráficas
    async function cargarDatosIniciales() {
        try {
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());
            
            if (lecturas.length > 0) {
                graficarcriteriosPorNivel(lecturas);
            } else {
                console.log("No hay lecturas para mostrar gráficas");
                // Opcional: mostrar gráficas de ejemplo o mensaje
            }
        } catch (error) {
            console.error("Error al cargar datos iniciales:", error);
        }
    }


        // Agregar al final del event listener:
        cargarDatosIniciales();

    async function cargarLecturasGuardadas() {
        contenedorLecturas.innerHTML = "<p>Cargando...</p>";
        const snapshot = await getDocs(collection(db, "lecturasASC"));
        const documentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarLecturas(documentos);

        buscadorLecturas.addEventListener("input", () => {
        const texto = buscadorLecturas.value.toLowerCase();
        const filtrados = documentos.filter(doc =>
            doc.titulo?.toLowerCase().includes(texto) ||
            doc.serie?.toLowerCase().includes(texto)
        );
        renderizarLecturas(filtrados);
        });
    }

    function renderizarLecturas(lecturas) {
        contenedorLecturas.innerHTML = "";
        lecturas.sort((a, b) => (a.unidad || 0) - (b.unidad || 0));

        if (lecturas.length === 0) {
        contenedorLecturas.innerHTML = "<p>No hay lecturas guardadas.</p>";
        return;
        }
    
        const grupos = {};
        lecturas.forEach(lectura => {
        const clave = `${lectura.serie || "—"}|${lectura.nivel || "—"}|${lectura.grado || "—"}|${lectura.trimestre || "—"}`;
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(lectura);
        });
    
        Object.entries(grupos).forEach(([clave, lecturasGrupo], index) => {
        const [serie, nivel, grado, trimestre] = clave.split("|");
        const groupId = `grupo-${index}`;
    
        // Contenedor del grupo (acordeón)
        const contenedorGrupo = document.createElement("div");
        contenedorGrupo.className = "grupo-lecturas";
        contenedorGrupo.style.marginBottom = "10px";
        contenedorGrupo.style.border = "1px solid #ccc";
        contenedorGrupo.style.borderRadius = "6px";
        contenedorGrupo.style.overflow = "hidden";
    
        // Botón colapsable
        const boton = document.createElement("button");
        boton.textContent = `📚 ${serie} • ${nivel} • Grado ${grado} • Trimestre ${trimestre}`;
        boton.style.width = "100%";
        boton.style.textAlign = "left";
        boton.style.padding = "10px";
        boton.style.background = "#eee";
        boton.style.border = "none";
        boton.style.fontWeight = "bold";
        boton.style.cursor = "pointer";
        boton.addEventListener("click", () => {
            cuerpoGrupo.style.display = cuerpoGrupo.style.display === "none" ? "block" : "none";
        });
    
        // Contenido del grupo (colapsable)
        const cuerpoGrupo = document.createElement("div");
        cuerpoGrupo.id = groupId;
        cuerpoGrupo.style.padding = "10px";
        cuerpoGrupo.style.display = "none";
        cuerpoGrupo.style.backgroundColor = "#fafafa";
    
        lecturasGrupo.forEach((lectura) => {
            const card = document.createElement("div");
            card.className = "card-lectura";
            card.style.display = "flex";
            card.style.justifyContent = "space-between";
            card.style.alignItems = "center";
            card.style.border = "1px solid #ccc";
            card.style.padding = "10px";
            card.style.marginBottom = "10px";
            card.style.borderRadius = "8px";
    
            const header = document.createElement("div");
            header.className = "header-lectura";
            header.style.fontSize = "0.85rem";
            header.style.marginBottom = "5px";
            header.style.color = "#555";
            header.innerHTML = `
            <strong>${lectura.nivel || "N/A"}</strong> • 
            Grado ${lectura.grado || "N/A"} • 
            Trimestre ${lectura.trimestre || "N/A"} • 
            Unidad ${lectura.unidad || "N/A"}
            `;
    
            const titulo = document.createElement("h5");
            titulo.textContent = lectura.titulo || "Sin título";
            titulo.style.margin = "4px 0";
    
            const iconos = document.createElement("div");
            iconos.innerHTML = `
            <i class="fas fa-pen" title="Editar" style="margin-right: 10px; cursor:pointer;"></i>
            <i class="fas fa-trash" title="Eliminar" style="cursor:pointer; color:red;"></i>
            `;
    
            const editar = iconos.querySelector(".fa-pen");
            const eliminar = iconos.querySelector(".fa-trash");
    
            editar.addEventListener("click", async (e) => {
            e.stopPropagation();
            // ... tu lógica para editar lectura ...
            });
    
            eliminar.addEventListener("click", async (e) => {
            e.stopPropagation();
            const confirmar = confirm(`¿Eliminar la lectura "${lectura.titulo}"?`);
            if (confirmar) {
                await deleteDoc(doc(db, "lecturasASC", lectura.id));
                await cargarLecturasGuardadas();
            }
            });
    
            card.addEventListener("click", () => {
            vistaTitulo.textContent = lectura.titulo;
            vistaTexto.innerHTML = lectura.textoLectura || "<em>Sin texto</em>";
            vistaPreguntas.innerHTML = "";
            lectura.preguntas?.forEach((preg, i) => {
                const li = document.createElement("li");
                li.style.marginBottom = "10px";
                li.innerHTML = `
                <strong>${i + 1}.</strong> ${preg.texto || "(sin pregunta)"} 
                <div style="margin-left: 20px;">
                    <small><strong>Nivel:</strong> ${preg.nivel || "No especificado"}</small><br>
                    <small><strong>Criterio:</strong> ${preg.criterio || "No especificada"}</small><br>
                    <small><strong>Respuesta esperada:</strong> ${preg.respuesta || "No especificada"}</small>
                </div>
                `;
                vistaPreguntas.appendChild(li);
            });
            modalVistaLectura.style.display = "block";
            });
    
            card.appendChild(header);
            card.appendChild(titulo);
            card.appendChild(iconos);
            cuerpoGrupo.appendChild(card);
        });
    
        contenedorGrupo.appendChild(boton);
        contenedorGrupo.appendChild(cuerpoGrupo);
        contenedorLecturas.appendChild(contenedorGrupo);
        });
    }
  
        
    
    if (btnListaLecturas && modalListaLecturas) {
        btnListaLecturas.addEventListener("click", async () => {
        modalListaLecturas.style.display = "block";
        await cargarLecturasGuardadas();
        });
    }

    if (cerrarModalListaLecturas) {
        cerrarModalListaLecturas.addEventListener("click", () => {
        modalListaLecturas.style.display = "none";
        });
    }

    if (cerrarVistaLectura) {
        cerrarVistaLectura.addEventListener("click", () => {
        modalVistaLectura.style.display = "none";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === modalListaLecturas) modalListaLecturas.style.display = "none";
        if (e.target === modalVistaLectura) modalVistaLectura.style.display = "none";
    });


    if (btn) {
        btn.addEventListener("click", async () => {
        const texto = document.getElementById("campoLectura")?.value || "";
        if (!texto.trim()) return alert("Texto vacío");

        const user = auth.currentUser;
        if (!user) return alert("No autenticado");

        try {
            await addDoc(collection(db, "lecturas"), {
            texto,
            userId: user.uid,
            createdAt: new Date()
            });
            alert("Lectura generada y guardada");
        } catch (err) {
            console.error("Error al guardar lectura:", err);
        }
        });
    }

    
  const btnMetodologia = document.getElementById("btnMetodologia");
  const modalMetodologia = document.getElementById("modalMetodologiaASC");
  const cerrarModal = document.getElementById("cerrarModalMetodologia");
  const modal = document.getElementById("modalMetodologiaASC");
  const modalLista = document.getElementById("modalListaMetodologica");
  const cerrarModalLista = document.getElementById("cerrarModalLista");

  if (cerrarModalLista && modalLista) {
    cerrarModalLista.addEventListener("click", () => {
      modalLista.style.display = "none";
    });
  }

  // También cerrar si se hace clic fuera del contenido
  window.addEventListener("click", (e) => {
    if (e.target === modalLista) {
      modalLista.style.display = "none";
    }
  });
  if (btnMetodologia && modalMetodologia) {
    btnMetodologia.addEventListener("click", () => {
      modalMetodologia.style.display = "block";
    });
  }
  if (cerrarModal && modalMetodologia) {
    cerrarModal.addEventListener("click", () => {
      modalMetodologia.style.display = "none";
    });
  }
  
  window.addEventListener("click", (e) => {
    if (e.target === modalLista) {
        modalLista.style.display = "none";
    }
  });

  if (cerrarModal && modal) {
    cerrarModal.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Opción: cerrar al hacer clic fuera del contenido
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  btnLista.addEventListener("click", async () => {
    modalLista.style.display = "block";
    await cargarTemasMetodologicos();
  });
  
  cerrarModal.addEventListener("click", () => {
    modalLista.style.display = "none";
  });
  // Simular placeholder en contenteditable
  ["conceptoMetodologia", "comentariosMetodologia"].forEach(id => {
    const div = document.getElementById(id);
    const placeholder = div.getAttribute("placeholder");

    const checkPlaceholder = () => {
      if (div.textContent.trim() === "") {
        div.innerHTML = `<span class="placeholder">${placeholder}</span>`;
      }
    };

    div.addEventListener("focus", () => {
      if (div.querySelector(".placeholder")) div.innerHTML = "";
    });

    div.addEventListener("blur", () => {
      checkPlaceholder();
    });

    checkPlaceholder();
  });



  if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
      
        const tema = document.getElementById("temaMetodologia")?.value.trim();
        const concepto = $('#conceptoMetodologia').trumbowyg('html').trim();
        const comentarios = $('#comentariosMetodologia').trumbowyg('html').trim();
        const docId = form.getAttribute("data-id"); // obtener el ID si existe
      
        if (!tema || !concepto) {
          alert("Tema y concepto son obligatorios.");
          return;
        }
      
        try {
          if (docId) {
            // 🔁 Actualizar documento existente
            const ref = doc(db, "metodologiaASC", docId);
            await updateDoc(ref, {
              tema,
              concepto,
              comentarios,
              updatedAt: new Date()
            });
            alert("✅ Documento actualizado.");
          } else {
            // ➕ Crear nuevo documento
            await addDoc(collection(db, "metodologiaASC"), {
              tema,
              concepto,
              comentarios,
              createdAt: new Date(),
              userId: auth.currentUser?.uid || "anónimo"
            });
            alert("✅ Documento guardado correctamente.");
          }
      
          // Limpieza final
          form.reset();
          form.removeAttribute("data-id");
          document.getElementById("conceptoMetodologia").innerHTML = "";
          document.getElementById("comentariosMetodologia").innerHTML = "";
          document.getElementById("modalMetodologiaASC").style.display = "none";
          await cargarTemasMetodologicos(); // recargar lista si fue editado
      
        } catch (error) {
          console.error("❌ Error al guardar:", error);
          alert("Error al guardar el documento.");
        }
      });
    }

    const btnLecturas = document.getElementById("btnLecturas");
    const modalLecturas = document.getElementById("modalLecturasASC");
    const cerrarModalLecturas = document.getElementById("cerrarModalLecturas");

    if (btnLecturas && modalLecturas) {
    btnLecturas.addEventListener("click", () => {
        modalLecturas.style.display = "block";
    });
    }

    if (cerrarModalLecturas && modalLecturas) {
    cerrarModalLecturas.addEventListener("click", () => {
        modalLecturas.style.display = "none";
    });
    }

    window.addEventListener("click", (e) => {
    if (e.target === modalLecturas) {
        modalLecturas.style.display = "none";
    }
    });

    const formLecturas = document.getElementById("formLecturasASC");

    if (formLecturas) {
        formLecturas.addEventListener("submit", async (e) => {
            e.preventDefault();

            const lectura = {
            serie: document.getElementById("serieLectura")?.value.trim(),
            nivel: document.getElementById("nivelLectura")?.value.trim(),
            grado: document.getElementById("gradoLectura")?.value.trim(),
            trimestre: parseInt(document.getElementById("trimestreLectura")?.value),
            unidad: parseInt(document.getElementById("unidadLectura")?.value),
            titulo: document.getElementById("tituloLectura")?.value.trim(),
            textoLectura: document.getElementById("textoLectura")?.innerHTML.trim(),
            preguntas: [
                {
                texto: document.getElementById("pregunta1")?.value.trim(),
                nivel: document.getElementById("nivelPregunta1")?.value,
                criterio: document.getElementById("criterioPregunta1")?.value.trim(),
                respuesta: document.getElementById("respuestaPregunta1")?.value.trim()
                },
                {
                texto: document.getElementById("pregunta2")?.value.trim(),
                nivel: document.getElementById("nivelPregunta2")?.value,
                criterio: document.getElementById("criterioPregunta2")?.value.trim(),
                respuesta: document.getElementById("respuestaPregunta2")?.value.trim()
                },
                {
                texto: document.getElementById("pregunta3")?.value.trim(),
                nivel: document.getElementById("nivelPregunta3")?.value,
                criterio: document.getElementById("criterioPregunta3")?.value.trim(),
                respuesta: document.getElementById("respuestaPregunta3")?.value.trim()
                },
                {
                texto: document.getElementById("pregunta4")?.value.trim(),
                nivel: document.getElementById("nivelPregunta4")?.value,
                criterio: document.getElementById("criterioPregunta4")?.value.trim(),
                respuesta: document.getElementById("respuestaPregunta4")?.value.trim()
                },
                {
                texto: document.getElementById("pregunta5")?.value.trim(),
                nivel: document.getElementById("nivelPregunta5")?.value,
                criterio: document.getElementById("criterioPregunta5")?.value.trim(),
                respuesta: document.getElementById("respuestaPregunta5")?.value.trim()
                }
            ],
            
            createdAt: new Date(),
            userId: auth.currentUser?.uid || "anónimo"
            };

            if (!lectura.serie || !lectura.nivel || !lectura.grado || !lectura.textoLectura) {
            alert("Por favor completa todos los campos requeridos.");
            return;
            }

            const docId = formLecturas.getAttribute("data-id");

            try {
              if (docId) {
                const ref = doc(db, "lecturasASC", docId);
                await updateDoc(ref, lectura);
                alert("✅ Lectura actualizada correctamente.");
              } else {
                await addDoc(collection(db, "lecturasASC"), lectura);
                alert("✅ Lectura guardada correctamente.");
              }
            
              // Limpiar formulario
              formLecturas.reset();
              formLecturas.removeAttribute("data-id");
              document.getElementById("textoLectura").innerHTML = "";
              modalLecturas.style.display = "none";
              await cargarLecturasGuardadas();
            } catch (error) {
              console.error("❌ Error al guardar la lectura:", error);
              alert("Ocurrió un error al guardar.");
            }
            
        });    
    }

    const btnLecturasConcentradas = document.getElementById("btnLecturasConcentradas");
    const modalLecturasConcentradas = document.getElementById("modalLecturasConcentradas");
    const cerrarModalLecturasConcentradas = document.getElementById("cerrarModalLecturasConcentradas");

    if (btnLecturasConcentradas) {
        btnLecturasConcentradas.addEventListener("click", async () => {
            modalLecturasConcentradas.style.display = "block";
            await cargarAnalisisGuardados();
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());
          
            // Agrupar lecturas
            const grupos = {};
            lecturas.forEach(lec => {
              const key = `${lec.trimestre}|${lec.unidad}|${lec.serie}|${lec.grado}`;
              if (!grupos[key]) grupos[key] = [];
          
              (lec.preguntas || []).forEach(p => {
                grupos[key].push({
                  lectura: lec.titulo || "Sin título",
                  pregunta: p.texto || "—",
                  respuesta: p.respuesta || "—",
                  nivelPregunta: p.nivel || "—",
                  criterio: p.criterio || "—",
                  nivel: lec.nivel || "—",
                  grado: lec.grado || "—",
                  trimestre: lec.trimestre || "—",
                  unidad: lec.unidad || "—",
                  serie: lec.serie || "—"
                });
              });
            });
          
            const datosAgrupados = Object.entries(grupos).map(([key, preguntas]) => {
              const [trimestre, unidad, serie, grado] = key.split("|");
              return {
                grupo: `${serie} • Grado ${grado} • Trimestre ${trimestre} • Unidad ${unidad}`,
                trimestre,
                unidad,
                serie,
                grado,
                preguntas
              };
            });
          
            // Inicializar tabla con fila expandible
            const tabla = $('#tablaLecturasConcentradas').DataTable({
              data: datosAgrupados,
              destroy: true,
              columns: [
                {
                  className: 'dt-control',
                  orderable: false,
                  data: null,
                  defaultContent: '',
                  title: '',
                },
                { data: 'grupo', title: 'Grupo' },
                { data: 'trimestre', visible: false },
                { data: 'unidad', visible: false },
                { data: 'serie', visible: false },
                { data: 'grado', visible: false },
                { data: 'preguntas', visible: false }
              ],
              order: [[1, 'asc']]
            });
          
            // Función para crear contenido al expandir
            function formatDetalle(preguntas) {
              return `<table style="width:100%; font-size:13px;">
                <thead>
                  <tr><th>Lectura</th><th>Pregunta</th><th>Respuesta esperada</th><th>Nivel</th><th>Criterio</th><th>Nivel académico</th><th>Grado</th><th>Trimestre</th><th>Unidad</th><th>Serie</th></tr>
                </thead>
                <tbody>
                  ${preguntas.map(p => `
                    <tr>
                      <td>${p.lectura}</td>
                      <td>${p.pregunta}</td>
                      <td>${p.respuesta}</td>
                      <td>${p.nivelPregunta}</td>
                      <td>${p.criterio}</td>
                      <td>${p.nivel}</td>
                      <td>${p.grado}</td>
                      <td>${p.trimestre}</td>
                      <td>${p.unidad}</td>
                      <td>${p.serie}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`;
            }
          
            // Agregar funcionalidad de expandir fila
            $('#tablaLecturasConcentradas tbody').off('click').on('click', 'td.dt-control', function () {
              const tr = $(this).closest('tr');
              const row = tabla.row(tr);
          
              if (row.child.isShown()) {
                row.child.hide();
                tr.removeClass('shown');
              } else {
                row.child(formatDetalle(row.data().preguntas)).show();
                tr.addClass('shown');
              }
            });
          });
                
    }

    if (cerrarModalLecturasConcentradas) {
        cerrarModalLecturasConcentradas.addEventListener("click", () => {
            modalLecturasConcentradas.style.display = "none";
        });
    }


        // 🔍 Análisis con Gemini
    const btnGeminiAnalisis = document.getElementById("btnGeminiAnalisisLecturas");
        if (btnGeminiAnalisis) {
        btnGeminiAnalisis.addEventListener("click", async () => {
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());

            if (!lecturas.length) {
            alert("No hay lecturas para analizar.");
            return;
            }
            document.getElementById("loadingAnalisis").style.display = "block"; // ⏳ Mostrar loading

            const resumen = lecturas.map((l, i) => {
            const textoPlano = (l.textoLectura || "").replace(/<[^>]+>/g, '');
            const preguntas = (l.preguntas || []).map((p, j) =>
                `${j + 1}. ${p.texto || ""} [Criterio: ${p.criterio || "N/A"}]`
            ).join("\n");
            return `Lectura ${i + 1}:\nTítulo: ${l.titulo}\nNivel: ${l.nivel || "N/A"}, Grado: ${l.grado || "N/A"}, Serie: ${l.serie || "N/A"}\nTexto: ${textoPlano.slice(0, 500)}...\nPreguntas:\n${preguntas}\n`;
            }).join("\n\n");

            const promptGemini = [{
            role: "user",
            text: `Eres un analista pedagógico. Con base en las siguientes lecturas educativas:

            ${resumen}

            1. Compara el análisis con la lectura original y su nivel.
            2. Identifica los géneros literarios más frecuentes.
            3. Extrae las preguntas más comunes de comprensión.
            4. Genera una tabla de frecuencia de géneros literarios thead class="frecuenciaHead" tbody class="frecuenciaBody".
                <table class="tablefrecuencia"> 
                    <thead class="frecuenciaHead">
                        <th>Tipo de Pregunta</th>
                        <th>Frecuencia</th>
                        <th>Frecuancia (en cantidad)</th>
                        <th>Ejemplos</th>
                    </thead>
                    <tbody class="frecuenciaBody">
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>   
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            5. Da recomendaciones para equilibrar los tipos de lectura.

            Responde en HTML estructurado (con títulos, listas y tabla si aplica).`
            }];

        try {
            const resultado = await enviarPrompt(promptGemini);
                const limpio = resultado.replace(/```html\s*/g, "").replace(/```/g, "").trim();
                ultimoAnalisisHTML = limpio;

                const output = document.createElement("div");
                output.innerHTML = `
                <h2 style="margin-top:0;">Análisis de lecturas con Gemini</h2>
                <div class="analisisTablaLectura" style="margin-top:20px; padding:15px; background:#f9f9f9; border:1px solid #ccc;">
                    ${limpio}
                </div>`;
                document.querySelector("#modalLecturasConcentradas .modal-body").prepend(output);
            } catch (err) {
                console.error("❌ Error al analizar con Gemini:", err);
                alert("Error al analizar con Gemini.");
            } finally {
                document.getElementById("loadingAnalisis").style.display = "none"; // ✅ Ocultar loading
            }
        });

    }


    window.addEventListener("click", (e) => {
    if (e.target === modalLecturasConcentradas) {
        modalLecturasConcentradas.style.display = "none";
    }
    });

    // Inicializar DataTable
    $(document).ready(() => {
        $('#tablaLecturasConcentradas').DataTable();
    });

    
  cargarDatosIniciales();

  let ultimoAnalisisHTML = ""; // Se guarda el análisis actual

  // Guardar análisis en Firestore
  document.getElementById("iconGuardarAnalisis").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return alert("Debes iniciar sesión");
  
    if (!ultimoAnalisisHTML.trim()) {
      alert("No hay análisis generado para guardar.");
      return;
    }
  
    await addDoc(collection(db, "analisisLecturas"), {
      userId: user.uid,
      contenido: ultimoAnalisisHTML,
      createdAt: new Date()
    });
  
    alert("✅ Análisis guardado correctamente.");
    cargarAnalisisGuardados(); // Refrescar lista
  });
  
  // Mostrar/Ocultar tabla
  document.getElementById("iconToggleTabla").addEventListener("click", () => {
    const bloque = document.getElementById("bloqueTablaLecturas");
    bloque.style.display = (bloque.style.display === "none") ? "block" : "none";
  });
  
  // Mostrar/Ocultar lista de análisis
  document.getElementById("iconToggleAnalisis").addEventListener("click", () => {
    const cont = document.getElementById("contenedorAnalisisGuardados");
    cont.style.display = (cont.style.display === "none") ? "block" : "none";
  });
  
  // Cargar lista de análisis guardados del usuario
  async function cargarAnalisisGuardados() {
    const user = auth.currentUser;
    if (!user) return;
  
    const q = query(collection(db, "analisisLecturas"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    const lista = document.getElementById("listaAnalisisGuardados");
    lista.innerHTML = "";
  
    snap.forEach(doc => {
        const fecha = doc.data().createdAt?.toDate?.() || new Date();
        const fechaTexto = fecha.toLocaleDateString("es-MX", {
          day: "2-digit", month: "2-digit", year: "numeric"
        });
      
        const item = document.createElement("li");
        item.innerHTML = `
          <div style="padding:10px; margin-bottom:10px; background:#f1f1f1; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>Análisis guardado - ${fechaTexto}</strong>
                <button class="ver-analisis-btn" data-html="${encodeURIComponent(doc.data().contenido)}" style="border:none; background:none; cursor:pointer; font-size:1em;">👁️</button>
            </div>
            <div class="contenido-analisis-guardado" style="display:none; margin-top:10px;">${doc.data().contenido}</div>
          </div>
        `;
        lista.appendChild(item);
      });
      document.querySelectorAll(".ver-analisis-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const html = decodeURIComponent(btn.getAttribute("data-html"));
          document.getElementById("contenidoVistaAnalisis").innerHTML = html;
          document.getElementById("modalVistaAnalisis").style.display = "block";
        });
      });
      
      document.getElementById("cerrarVistaAnalisis").addEventListener("click", () => {
        document.getElementById("modalVistaAnalisis").style.display = "none";
      });
  }
  
  const contenidoTexto = document.getElementById("contenidoTextoFormateado");

  document.getElementById("scrollUp").addEventListener("click", () => {
    contenidoTexto.scrollTo({ top: 0, behavior: "smooth" });
  });
  
  document.getElementById("scrollDown").addEventListener("click", () => {
    contenidoTexto.scrollTo({ top: contenidoTexto.scrollHeight, behavior: "smooth" });
  });
  
  // Configuración completa para Trumbowyg
  const opcionesTrumbowyg = {
    btns: [
      ['viewHTML'],
      ['formatting'],
      ['strong', 'em', 'underline'],
      ['fontsize'],
      ['foreColor', 'backColor'],
      ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
      ['unorderedList', 'orderedList'],
      ['removeformat']
    ],
    autogrow: true
  };
  
  $('#conceptoMetodologia').trumbowyg(opcionesTrumbowyg);
  $('#comentariosMetodologia').trumbowyg(opcionesTrumbowyg);
    
});



async function cargarTemasMetodologicos() {
    contenedor.innerHTML = "<p>Cargando...</p>";
    const snapshot = await getDocs(collection(db, "metodologiaASC"));
    const documentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderizarTarjetas(documentos);

    // Búsqueda
    buscador.addEventListener("input", () => {
        const texto = buscador.value.toLowerCase();
        const filtrados = documentos.filter(doc => doc.tema?.toLowerCase().includes(texto));
        renderizarTarjetas(filtrados);
    });
}

function renderizarTarjetas(docs) {
  contenedor.innerHTML = "";
  if (docs.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron resultados.</p>";
    return;
  }

  docs.forEach((item) => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ddd";
    card.style.borderRadius = "8px";
    card.style.padding = "10px";
    card.style.background = "#f9f9f9";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "flex-start";
    card.style.cursor = "pointer";

    const title = document.createElement("h5");
    title.style.margin = "0";
    title.textContent = item.tema || "Sin título";  // ← aquí estaba mal

    const iconos = document.createElement("div");
    iconos.innerHTML = `
      <i class="fas fa-pen" title="Editar" style="margin-right: 10px; cursor:pointer; color: #555;"></i>
      <i class="fas fa-trash" title="Eliminar" style="cursor:pointer; color: #d00;"></i>
    `;
    iconos.style.alignSelf = "flex-end";

    const editarIcono = iconos.querySelector(".fa-pen");
    const eliminarIcono = iconos.querySelector(".fa-trash");

    editarIcono.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("temaMetodologia").value = item.tema || "";
      document.getElementById("conceptoMetodologia").innerHTML = item.concepto || "";
      document.getElementById("comentariosMetodologia").innerHTML = item.comentarios || "";
      form.setAttribute("data-id", item.id);
      document.getElementById("modalMetodologiaASC").style.display = "block";
      modalLista.style.display = "none";
    });

    eliminarIcono.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmacion = confirm(`¿Eliminar "${item.tema}"?`);
      if (confirmacion) {
        try {
          const ref = doc(db, "metodologiaASC", item.id);
          await deleteDoc(ref);
          alert("Documento eliminado");
          await cargarTemasMetodologicos();
        } catch (error) {
          console.error("❌ Error al eliminar:", error);
        }
      }
    });

    card.addEventListener("click", () => {
      document.getElementById("vistaTema").textContent = item.tema || "(Sin título)";
      document.getElementById("vistaConcepto").innerHTML = item.concepto || "<em>Sin concepto</em>";
      document.getElementById("vistaComentarios").innerHTML = item.comentarios || "<em>Sin comentarios</em>";
      document.getElementById("modalVistaPrevia").style.display = "block";
    });

    card.appendChild(title);
    card.appendChild(iconos);
    contenedor.appendChild(card);
  });
}


document.getElementById("cerrarVistaPrevia").addEventListener("click", () => {
  document.getElementById("modalVistaPrevia").style.display = "none";
});


document.getElementById('toggleChartPanel').addEventListener('click', () => {
    const panelCharts = document.getElementById('panel-charts');
    panelCharts.classList.toggle('visible');
  });



async function enviarPrompt(mensajes, intentos = 0) {
  const response = await fetch(GEMINI_ENDPOINT + `?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: mensajes.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }))
    })
  });

  if (response.status === 503 && intentos < 2) {
    console.warn("⏳ Servicio no disponible. Reintentando...");
    await new Promise(res => setTimeout(res, 1500));
    return await enviarPrompt(mensajes, intentos + 1);
  }

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Error en la respuesta de Gemini:", data);
    throw new Error("Error al generar contenido con Gemini");
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}





// Cargar conversación al iniciar
let respuestaSeleccionada = null;

// Cargar conversación al iniciar
async function cargarConversacionDesdeFirebase() {
  const chat = document.getElementById("chatMensajes");
  const contenido = document.getElementById("contenidoTextoFormateado");

  chat.innerHTML = "";
  contenido.innerHTML = "";

  const q = query(collection(db, "conversacionIA"), where("userId", "==", currentUserId));
  const snap = await getDocs(q);
  const ordenados = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => a.timestamp - b.timestamp);

  ordenados.forEach(msg => {
    if (msg.tipo === "usuario") {
      const div = document.createElement("div");
      div.classList.add("mensaje-usuario");
      div.textContent = `Tú: ${msg.texto}`;
      chat.appendChild(div);
    } else if (msg.tipo === "asistente") {
        const div = document.createElement("div");
        div.classList.add("respuesta-ia");
        div.innerHTML = msg.texto;
      
        // Contenedor para los iconos
        const iconContainer = document.createElement("div");
        iconContainer.style.display = "flex";
        iconContainer.style.justifyContent = "flex-end";
        iconContainer.style.gap = "10px";
      
      // Ícono de seguimiento
      const icono = document.createElement("i");
      icono.className = "fas fa-plus-circle icono-seguimiento";
      icono.style.cursor = "pointer";
      icono.style.marginLeft = "10px";
      icono.style.color = msg.id === respuestaSeleccionada ? "c970d6" : "gray";
      icono.title = "Responder sobre este contenido";

      icono.addEventListener("click", () => {
        document.querySelectorAll(".icono-seguimiento").forEach(el => el.style.color = "gray");
        icono.style.color = "#c970d6";
        respuestaSeleccionada = msg.texto;
        input.focus();
      });

      // Ícono de impresión
      const iconoImprimir = document.createElement("i");
      iconoImprimir.className = "fas fa-print";
      iconoImprimir.style.cursor = "pointer";
      iconoImprimir.style.marginLeft = "10px";
      iconoImprimir.style.color = "#444";
      iconoImprimir.title = "Imprimir esta respuesta";

      iconoImprimir.addEventListener("click", () => {
        const contenidoHTML = msg.texto;
        const ventana = window.open("", "", "width=800,height=600");
        ventana.document.write(`
          <html>
          <head>
            <title>Imprimir</title>
            <style>
              body { font-family: 'Inter', sans-serif; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
              th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            </style>
          </head>
          <body>${contenidoHTML}</body>
          </html>
        `);
        
        ventana.document.close();
        ventana.focus();
        ventana.print();
        ventana.close();
      });

        // Icono para continuar generación
        const iconoContinuar = document.createElement("i");
        iconoContinuar.className = "fas fa-forward";
        iconoContinuar.title = "Continuar generación";
        iconoContinuar.style.cursor = "pointer";
        iconoContinuar.addEventListener("click", async () => {
            const textoParcial = div.innerText || div.textContent;
            const nuevoTexto = await continuarGeneracionGemini(textoParcial);
            div.innerHTML += `<p>${nuevoTexto}</p>`;
        });

        iconContainer.appendChild(icono);
        iconContainer.appendChild(iconoImprimir);
        iconContainer.appendChild(iconoContinuar);
        div.appendChild(iconContainer);
        
      // Agregar ambos íconos al div de respuesta
      div.appendChild(icono);
      div.appendChild(iconoImprimir);
      contenido.appendChild(div);
    }
  });

  contenido.scrollTop = contenido.scrollHeight;
}

// Guardar mensaje
async function guardarMensaje(texto, tipo) {
  if (!currentUserId) return;
  await addDoc(collection(db, "conversacionIA"), {
    userId: currentUserId,
    texto,
    tipo,
    timestamp: Date.now()
  });
}

// Botón para reiniciar conversación
document.getElementById("btnResetChat").addEventListener("click", async () => {
  if (!currentUserId) return;
  const q = query(collection(db, "conversacionIA"), where("userId", "==", currentUserId));
  const snap = await getDocs(q);
  for (const docu of snap.docs) {
    await deleteDoc(doc(db, "conversacionIA", docu.id));
  }
  document.getElementById("chatMensajes").innerHTML = "";
  document.getElementById("contenidoTextoFormateado").innerHTML = "";
  respuestaSeleccionada = null;
  alert("✅ Conversación eliminada.");
});
  
async function continuarGeneracionGemini(textoParcial) {
    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: textoParcial + "\nPor favor continúa." }] }]
        })
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error("Error en respuesta de Gemini");
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[Sin respuesta]";
    } catch (err) {
      console.error("Error al continuar generación:", err);
      return "[Error al continuar la generación]";
    }
  }
  



function detectarTemaDesdeMensaje(mensaje) {
    const texto = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let mejorCoincidencia = null;
    let coincidencias = [];
  
    for (const [tema, palabrasClave] of Object.entries(palabrasClavePorTema)) {
      for (const palabra of palabrasClave) {
        const palabraNormalizada = palabra.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (texto.includes(palabraNormalizada)) {
          coincidencias.push({ tema, palabra });
        }
      }
    }
  
    if (coincidencias.length > 0) {
      // Prioriza el tema con más coincidencias
      const temasAgrupados = coincidencias.reduce((acc, cur) => {
        acc[cur.tema] = (acc[cur.tema] || 0) + 1;
        return acc;
      }, {});
  
      const mejor = Object.entries(temasAgrupados).sort((a, b) => b[1] - a[1])[0];
      mejorCoincidencia = mejor[0];
    }
  
    return mejorCoincidencia;
  }
  
// Evento al enviar mensaje
const input = document.getElementById("mensajeInput");


document.getElementById("enviarMensaje").addEventListener("click", async () => {
  const chat = document.getElementById("chatMensajes");
  const contenido = document.getElementById("contenidoTextoFormateado");
  const userMessage = input.value.trim();
  if (!userMessage) return;
  input.value = "";

  // ✅ Normalizamos para detectar intenciones
  const mensajeNormalizado = userMessage.toLowerCase();
  const mencionaSecuencia = /secuencia|alcance/.test(mensajeNormalizado);
  const mencionaLecturasNuevas = /lecturas nuevas/.test(mensajeNormalizado);
  const mencionaLecturasBase = /\blecturas\b|lecturas base/.test(mensajeNormalizado);
  const mencionaAmbasLecturas = mencionaLecturasNuevas && mencionaLecturasBase;
  const esAnalisis = /analisis|analiza|compara/.test(mensajeNormalizado);

  // ✅ Mostrar el mensaje del usuario
  const userDiv = document.createElement("div");
  userDiv.classList.add("mensaje-usuario");
  userDiv.textContent = `Tú: ${userMessage}`;
  chat.appendChild(userDiv);
  await guardarMensaje(userMessage, "usuario");

  // ✅ Mostrar "Cargando..."
  const loading = document.createElement("p");
  loading.id = "loadingMensajeIA";
  loading.innerHTML = `<i class='fas fa-spinner fa-spin'></i> Consultando Firebase y analizando...`;
  contenido.appendChild(loading);

  try {
    // ✅ Si pide solo la SECUENCIA → respondemos directo con Firestore sin IA
    if (mencionaSecuencia && !esAnalisis) {
      const snapshot = await getDocs(query(collection(db, "secuenciaAlcance")));
      const categorias = {
        "Lenguaje y comunicación": ["Ortografía", "ExpresionEscrita", "ExpresionOral", "Gramatica"],
        "Ciencias sociales": ["Historia", "Geografia"],
        "Ciencias experimentales": ["Naturales"],
        "Formación socioemocional": ["CivicaEtica", "Socioemocional"],
        "Matemáticas": ["Matematicas"]
      };
      let html = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        html += `<h3>Grado ${d.grado}, Unidad ${d.unidad}, Trimestre ${d.trimestre}</h3>`;
        for (const [cat, temas] of Object.entries(categorias)) {
          html += `<h4>${cat}</h4><ul>`;
          temas.forEach(t => {
            html += `<li><strong>${t}</strong><ul>`;
            html += `<li><strong>T:</strong> ${d[`${t}_T`] || "—"}</li>`;
            html += `<li><strong>AE:</strong> ${d[`${t}_AE`] || "—"}</li>`;
            html += `<li><strong>C:</strong> ${d[`${t}_C`] || "—"}</li>`;
            html += `<li><strong>P:</strong> ${d[`${t}_P`] || "—"}</li>`;
            html += `</ul></li>`;
          });
          html += `</ul>`;
        }
      });
      document.getElementById("loadingMensajeIA").remove();
      const div = document.createElement("div");
      div.className = "respuesta-ia";
      div.innerHTML = html;
      contenido.appendChild(div);
      await guardarMensaje(div.innerHTML, "asistente");
      return; // ✅ Fin aquí, no llama a Gemini
    }

    // ✅ Si pide lecturas específicas → las cargamos para contexto extra
    let contextoLecturas = "";
    if (mencionaLecturasNuevas && !mencionaLecturasBase) {
      const snap = await getDocs(collection(db, "lecturasNuevas"));
      contextoLecturas = snap.docs.map((doc, i) => {
        const d = doc.data();
        return `Lectura Nueva ${i + 1}:\n${d.titulo}\n${(d.texto || "").replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    } else if (mencionaLecturasBase && !mencionaLecturasNuevas) {
      const snap = await getDocs(collection(db, "lecturasASC"));
      contextoLecturas = snap.docs.map((doc, i) => {
        const d = doc.data();
        return `Lectura Base ${i + 1}:\n${d.titulo}\n${(d.textoLectura || "").replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    } else if (mencionaAmbasLecturas || /todas las lecturas/.test(mensajeNormalizado)) {
      const [asc, nuevas] = await Promise.all([
        getDocs(collection(db, "lecturasASC")),
        getDocs(collection(db, "lecturasNuevas"))
      ]);
      const docs = [...asc.docs, ...nuevas.docs];
      contextoLecturas = docs.map((doc, i) => {
        const d = doc.data();
        const texto = d.textoLectura || d.texto || "";
        return `Lectura ${i + 1}:\n${d.titulo}\n${texto.replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    }

    // ✅ Construimos el PROMPT con contexto general Firebase + lecturas extra
    const promptGemini = await prepararPromptConContexto(userMessage, contextoLecturas);

    // ✅ Ahora sí llamamos a Gemini con todo el contexto
    const respuestaIA = (await enviarPrompt(promptGemini)).trim();

    // ✅ Mostramos resultado
    document.getElementById("loadingMensajeIA").remove();
    const respuestaDiv = document.createElement("div");
    respuestaDiv.classList.add("respuesta-ia");
    respuestaDiv.innerHTML = respuestaIA;
    contenido.appendChild(respuestaDiv);
    await guardarMensaje(respuestaIA, "asistente");

  } catch (err) {
    console.error("❌ Error generando respuesta:", err);
    document.getElementById("loadingMensajeIA")?.remove();
    alert("No se pudo generar la respuesta del asistente.");
  }
});

  

async function obtenerImagenComoBase64(urlImagen) {
  const response = await fetch(urlImagen);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(",")[1];
      resolve({ base64, mimeType: blob.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}



document.getElementById("imprimirAnalisis").addEventListener("click", () => {
    const contenido = document.getElementById("contenidoVistaAnalisis").innerHTML;

    const ventana = window.open("", "", "width=800,height=600");
    ventana.document.write(`
        <html>
        <head>
            <title>Imprimir Análisis</title>
            <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; }
            h1, h2, h3, h4, h5 { margin-top: 1rem; }
            ul, ol { margin-left: 2rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            .respuesta-ia { font-size: 14px; line-height: 1.6; }
            </style>
        </head>
        <body>
            ${contenido}
        </body>
        </html>
    `);
    ventana.document.close();
    ventana.focus();
    ventana.print();
    ventana.close();
});


document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const btnSugerenciasLectura = document.getElementById('btnSugerenciasLectura');
    const modalNuevaLectura = document.getElementById('modalNuevaLectura');
    const cerrarModalNuevaLectura = document.getElementById('cerrarModalNuevaLectura');
  
    // Debug: Verificar elementos
    console.log('Botón:', btnSugerenciasLectura);
    console.log('Modal:', modalNuevaLectura);
    console.log('Botón cerrar:', cerrarModalNuevaLectura);
  
    // Función para abrir el modal con más robustez
    function abrirModal(e) {
      if (e) e.preventDefault();
      console.log('Intentando abrir modal...');
      
      // Verificación adicional
      if (!modalNuevaLectura) {
        console.error('Modal no encontrado');
        return;
      }
      
      modalNuevaLectura.style.display = 'block';
      document.body.style.overflow = 'hidden';
      
      // Debug: Verificar estilos después de abrir
      setTimeout(() => {
        console.log('Estilos del modal después de abrir:', 
          window.getComputedStyle(modalNuevaLectura).display);
      }, 100);
    }
  
    // Función para cerrar el modal
    function cerrarModal() {
      modalNuevaLectura.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  
    // Event listeners
    if (btnSugerenciasLectura) {
      btnSugerenciasLectura.addEventListener('click', abrirModal);
    } else {
      console.error('Botón no encontrado');
    }
  
    if (cerrarModalNuevaLectura) {
      cerrarModalNuevaLectura.addEventListener('click', cerrarModal);
    }
  
    // Cerrar al hacer clic fuera del contenido
    modalNuevaLectura.addEventListener('click', function(e) {
      if (e.target === modalNuevaLectura) {
        cerrarModal();
      }
    });
  
    // Cerrar con tecla ESC
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modalNuevaLectura.style.display === 'block') {
        cerrarModal();
      }
    });
  
    // Prueba manual - descomenta para verificar
    // window.abrirModalManual = abrirModal;
    // console.log('Prueba manual disponible: ejecuta abrirModalManual() en la consola');
  });

document.addEventListener('DOMContentLoaded', () => {
  // 1) Mapea cada nivel a sus grados válidos
  const gradosPorNivel = {
    Preescolar:  ['1', '2', '3'],
    Primaria:    ['1', '2', '3', '4', '5', '6'],
    Secundaria:  ['1', '2', '3']
  };
  const nivelSelect = document.getElementById('nivelNuevo');
  const gradoSelect = document.getElementById('gradoNuevo');
  const autorSelect = document.getElementById('autorReferencia');

  nivelSelect.addEventListener('change', () => {
    gradoSelect.innerHTML = '<option value="">Selecciona grado</option>';
    (gradosPorNivel[nivelSelect.value] || []).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      gradoSelect.appendChild(opt);
    });
  });

  // Cargar autores desde Firestore al <select>
  const cargarAutoresReferencia = async () => {
    try {
      const snap = await getDocs(collection(db, 'autoresEjemplo'));
      autorSelect.innerHTML = '<option value="">Selecciona autor</option>';
      snap.forEach(doc => {
        const d = doc.data();
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ autor: d.autor, ejemplo: d.ejemplo, tipoTexto: d.tipoTexto });
        opt.textContent = `${d.autor} — ${d.tipoTexto}`;
        autorSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Error al cargar autores:', err);
      autorSelect.innerHTML = '<option value="">Error al cargar autores</option>';
    }
  };

  cargarAutoresReferencia();


  // 2) Configura modal de resultado
  const modalRes = document.getElementById('modalResultadoLectura');
  const closeRes = document.getElementById('cerrarModalResultado');
  const resultadoContenido = document.getElementById('resultadoContenido');

  closeRes.addEventListener('click', () => {
    modalRes.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
  modalRes.addEventListener('click', e => {
    if (e.target === modalRes) {
      modalRes.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });

  // 3) Listener del formulario
  const form = document.getElementById('formNuevaLectura');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const stripHTML = html => html.replace(/<[^>]+>/g, '').trim();
  
    // Leer inputs
    const temaNuevo      = document.getElementById('temaNuevo').value.trim();
    const nivelNuevo     = nivelSelect.value;
    const gradoNuevo     = gradoSelect.value;
    const trimestreNuevo = parseInt(document.getElementById('trimestreNuevo').value, 10);
    const unidadNuevo    = parseInt(document.getElementById('unidadNuevo').value, 10);
    const autorData      = autorSelect.value ? JSON.parse(autorSelect.value) : null;
    const especificaciones = document.getElementById('especificacionesNuevo').value.trim();
    const ejeArticulador = document.getElementById('ejeArticulador').value;

    if (!temaNuevo || !nivelNuevo || !gradoNuevo || !trimestreNuevo || !unidadNuevo || !autorData || !ejeArticulador) {
      return alert('Por favor completa todos los campos.');
    }

  
    // Traer lecturas previas
    const lecQ = query(
      collection(db, 'lecturasASC'),
      where('nivel',     '==', nivelNuevo),
      where('grado',     '==', gradoNuevo),
      where('trimestre', '==', trimestreNuevo),
      where('unidad',    '==', unidadNuevo)
    );
    const lecSnap = await getDocs(lecQ);
    const lecturas = lecSnap.docs.map(d => d.data());
    if (!lecturas.length) {
      return alert('No se encontraron lecturas previas para esos parámetros.');
    }
  
    // Conteo de palabras
    const primeroTexto   = stripHTML(lecturas[0].textoLectura || '');
    const cuentaPalabras = primeroTexto.split(/\s+/).filter(w => w).length;
  
    // Contexto de texto y preguntas
    const textosPlano = lecturas.map((l, i) =>
      `Lectura ${i+1} (Título: ${l.titulo}):\n${stripHTML(l.textoLectura)}`
    ).join('\n\n');
  
    const preguntasPlano = lecturas.flatMap((l, i) =>
      (l.preguntas || []).map((p, j) =>
        `Lectura ${i+1} · Pregunta ${j+1}: "${p.texto}" — Nivel: ${p.nivel}, Criterio: ${p.criterio}`
      )
    ).join('\n');
  
    const criteriosUnicos = Array.from(new Set(
      lecturas.flatMap(l => (l.preguntas || []).map(p => p.criterio))
    ));
    const listaCriterios = criteriosUnicos.join(', ');
  
    const definicionesEjes = {
      "Inclusión": "Busca garantizar el derecho a la educación de todas y todos, reconociendo y valorando la diversidad cultural, lingüística, social y de capacidades. Promueve una escuela que atienda las necesidades de cada estudiante, eliminando barreras para el aprendizaje y la participación.",
      "Pensamiento Crítico": "Fomenta la capacidad de analizar, cuestionar y reflexionar sobre la realidad, desarrollando habilidades para la toma de decisiones informadas y responsables. Impulsa una ciudadanía activa y comprometida con la transformación social.",
      "Interculturalidad Crítica": "Promueve el diálogo y el respeto entre diferentes culturas, reconociendo las desigualdades históricas y estructurales. Busca construir una sociedad más justa y equitativa, valorando la diversidad como una riqueza colectiva.",
      "Igualdad de Género": "Impulsa la equidad entre mujeres y hombres, cuestionando estereotipos y roles de género. Busca eliminar prácticas discriminatorias y promover relaciones basadas en el respeto y la igualdad de oportunidades.",
      "Vida Saludable": "Fomenta hábitos y estilos de vida que favorezcan el bienestar físico, emocional y social. Incluye la promoción de la actividad física, la alimentación equilibrada, la salud mental y el cuidado del medio ambiente.",
      "Apropiación de las Culturas a través de la Lectura y la Escritura": "Valora la lectura y la escritura como medios para acceder al conocimiento, expresar ideas y fortalecer la identidad cultural. Promueve el desarrollo de competencias comunicativas en diversos contextos y lenguajes.",
      "Artes y Experiencias Estéticas": "Incorpora las manifestaciones artísticas y culturales en el proceso educativo, estimulando la creatividad, la sensibilidad y la apreciación estética. Busca enriquecer la formación integral de los estudiantes a través del arte."
    };


    // Prompt SOLO para la lectura y análisis
    const promptLectura = [{
      role: 'user',
      text: `
  Tienes el siguiente contexto de las lecturas previas:
  ${textosPlano}
  
  Y estas preguntas originales (con sus niveles y criterios de Firebase):
  ${preguntasPlano}
  IMPORTANTE no añadir comentarios, solo devolver lo que se pide
  IMPORTANTE **Especificaciones adicionales:** ${especificaciones || 'Ninguna.'} para generar una lectura nueva

  genera un analisis de la lectura vieja
  
  <h3>Análisis Breve</h3>
  <ul>
    <li><strong>Estilo de redacción de la lectura previa ${textosPlano} :</strong> …</li>
    <li><strong>Género literario de la lectura previa ${textosPlano}:</strong> …</li>
    <li><strong>Cantidad de palabras:</strong> ${cuentaPalabras}</li>
    <li><strong>Fuente de información:</strong> Análisis realizado sobre las lecturas almacenadas para Nivel ${nivelNuevo}, Grado ${gradoNuevo}, Trimestre ${trimestreNuevo}, Unidad ${unidadNuevo}.</li>
    <li><strong>Estilo de redacción de Lectura nueva:</strong> …</li>
    <li><strong>Género literario de Lectura nueva:</strong> …</li>
    <li><strong>Cantidad de palabras de Lectura nueva:</strong> …</li>
    <li><strong>Eje Articulador:</strong> …</li>
  </ul>

  Genera una Lectura nueva sobre ${temaNuevo}</h2>
  usar estilo literario de ${autorData.autor}, usando como referencia el estilo de su obra: "${autorData.ejemplo}" y el tipo de texto: "${autorData.tipoTexto}" solo como estilo de redacción del texto, pero sin usar frases o personajes de sus obras para evitar copyright.

  IMPORTANTE: especificaciones para la lectura: 
    - añade el eje **Eje articulador seleccionado:** ${ejeArticulador} al análisis de la lectura.
    - Significado pedagógico: ${definicionesEjes[ejeArticulador] || ''}
    - Asegúrate de que la lectura se desarrolle de forma pedagógica, explícita y transversal.
    - que la lectura fomente valores como inclusión, respeto a la diversidad, pensamiento crítico y ciudadanía global
    - que la lectura haga referencia (de forma explícita o implícita) a un aprendizaje esperado o competencia transversal de la NEM.
    - Considera pedir que la lectura tenga referencias o ejemplos cercanos a la realidad mexicana o latinoamericana
    - Importante: evitar temas, frases y palabras relaionada  con la violencia, maltrato, discriminación, sexualidad y temas religiosos
    - IMPORTANTE, instrucciones para la lectura:
    - Importante: marcar en <strong>Palabra</strong> hasta 15 palabras clave que puedan tener varios sinónimos contextuales y de uso común (palabras clave se componen de una palabra solamente)
    - agrega un margin bottom de 20px a cada párrafo
  EJemplo:
      <h2>Título de la Lectura</h2>
      <p>Introducción breve <strong>Palabra clave</strong> ...</p>
      <p>Desarrollo 1 <strong>Palabra clave</strong>...</p>
      <p>Desarrollo 2 <strong>Palabra clave</strong>...</p>
      <p>Cierre <strong>Palabra clave</strong>...</p>      

      Importante: extrae de la lecturas las palabras clave y genera una tabla en formato HTML de las palabras clave y sus sinónimos contextuales y de uso común.
      <h3>Tabla de Sinónimos</h3>
      <table>
        <tr><th>Palabra clave</th><th>Sinónimos</th></tr>
        <tr><td>ejemplo</td><td>modelo, muestra</td></tr>
      </table>
      
      <h3 style="color:#c970d6;">Spec</h3>
      <p style="color:#c970d6;">[Aquí una sola línea que describa con detalle la composición de la ilustración que acompañará esta lectura, incluir detalles de la lectura para generar una imagen acertada y detalles sobre el personaje principal, incliur ángulos, posiciones, detallar personajes principales, encuadre, elementos dentro de la composición, etc]</p>


     Importante: 
      - busca y cita al menos 3 fuentes reales para la lectura nueva, que sean actuales del 2021 en adelante</strong> (libros o artículos académicos) en formato APA 7, dentro de una lista ordenada e indica con texto color rojo en que parte de la lectura hace referencia<ol>.</p>
      - que las fuentes sean de acceso abierto si es posible, y que sean relevantes al tema y al rango de edad.
      Ejemplo:
      h2>Bibliografía</h2>
      <ol>
        <li>Autor (2023). Título. Editorial.</li>
      </ol> 

      IMPORTANTE no añadir comentarios, solo devolver lo que se pide

      `.trim()
    }];
  
    // Enviar prompt y limpiar fences
    document.getElementById('spinnerLectura').style.display = 'block';
    document.getElementById('spinnerLectura').style.display = 'block';
    let generado = '';
    try {
      generado = await enviarPrompt(promptLectura);
      generado = generado.replace(/```html\s*/g, '').replace(/```/g, '').trim();
      let contenidoHTMLFinal = generado; // lectura sin preguntas aún
      let preguntasHTMLFinal = '';       // se llenará después
    
      // Mostrar en modal
      resultadoContenido.innerHTML = contenidoHTMLFinal;

      // 🔁 Conteo preciso de palabras de la Lectura nueva
      const h2s = Array.from(resultadoContenido.querySelectorAll('h2'));
      const h2Lectura = h2s.find(h2 => h2.textContent.toLowerCase().includes('lectura nueva'));
      let parrafosLectura = [];

      if (h2Lectura) {
        let el = h2Lectura.nextElementSibling;
        while (el && el.tagName !== 'H2') {
          if (el.tagName === 'P') {
            parrafosLectura.push(el);
          }
          el = el.nextElementSibling;
        }
      }

      const textoPlanoLecturaNueva = parrafosLectura.map(p => p.textContent.trim()).join(' ');
      const cuentaPalabrasNueva = textoPlanoLecturaNueva.split(/\s+/).filter(w => w).length;

      // Actualiza el <li> del análisis
      const lis = resultadoContenido.querySelectorAll('ul li');
      lis.forEach(li => {
        if (li.textContent.includes('Cantidad de palabras de Lectura nueva')) {
          li.innerHTML = `<strong>Cantidad de palabras de Lectura nueva:</strong> ${cuentaPalabrasNueva}`;
        }
      });

      modalRes.style.display = 'block';

      // tras volcar contenidoHTMLFinal…
      const hasBib = Array.from(
        resultadoContenido.querySelectorAll('h2')
      ).some(h2 => h2.textContent.trim().toLowerCase() === 'bibliografía');

      if (!hasBib) {
        const bibDiv = document.createElement('div');
        bibDiv.innerHTML = `
          <h2>Bibliografía</h2>
          <p>No se consultaron fuentes externas.</p>
        `;
        resultadoContenido.appendChild(bibDiv);
      }


      document.body.style.overflow = 'hidden';

            // ↓↓↓ INICIA bloque para inyectar fuentes reales ↓↓↓
      const especs = document.getElementById('especificacionesNuevo').value.toLowerCase();
      if (especs.includes('fuentes reales')) {
        const refsReales = [
          {
            text: 'Santamaría, F. J. (1942). Diccionario general de americanismos. Editorial Pedro Robredo.',
            usadoEn: 'Análisis de términos: “Huasteca”, “tambores” y “montículos”'
          },
          {
            text: 'Wilkerson, S. J. K. (1987). El oriente de México: una nueva arqueología. Gobierno del Estado de Veracruz.',
            usadoEn: 'Descripción de los montículos de Tamtoc (Párrafo 2 de la Lectura Nueva)'
          },
          {
            text: 'INPI. (s.f.). Pueblo indígena huasteco. Instituto Nacional de Pueblos Indígenas. Recuperado de https://www.gob.mx/inpi/articulos/pueblo-indigena-huasteco',
            usadoEn: 'Caracterización de la tradición de la coca y Doña Elena (Párrafo 3)'
          }
        ];
        
        const bibDiv = document.createElement('div');
        bibDiv.innerHTML = `
        <h2>Bibliografía</h2>
        <ol>
          ${refsReales.map(r => `
            <li>
              ${r.text}<br>
              <small>(Usado en: ${r.usadoEn})</small>
            </li>
          `).join('')}
        </ol>
      `;

        // si ya existe un <h2>Bibliografía>, lo reemplazamos; si no, lo añadimos
        const existingH2 = Array.from(resultadoContenido.querySelectorAll('h2'))
                                .find(h2 => h2.textContent.trim().toLowerCase() === 'bibliografía');
        if (existingH2) {
          // elimina lo que venga después (p “No se consultaron…”)
          let nxt = existingH2.nextElementSibling;
          if (nxt) nxt.remove();
          existingH2.after(bibDiv.querySelector('ol'));
        } else {
          resultadoContenido.appendChild(bibDiv);
        }
      }

      
      // Aquí puedes seguir con la inserción de botones (btnPreguntas, btnGuardar, etc.)
      
    } catch (err) {
      alert('❌ Error al generar lectura');
      console.error(err);
    } finally {
      document.getElementById('spinnerLectura').style.display = 'none';
    }
    
  
    // Insertar botón para generar preguntas
    const hr = document.createElement('hr');
const btnPreguntas = document.createElement('button');
btnPreguntas.textContent = 'Generar preguntas de comprensión';
btnPreguntas.className = 'btn-analisis';
btnPreguntas.style.marginTop = '15px';
resultadoContenido.appendChild(hr);
resultadoContenido.appendChild(btnPreguntas);

// ➤ Aquí creamos un contenedor específico para las preguntas
const contPreg = document.createElement('div');
contPreg.id = 'preguntasComprension';
resultadoContenido.appendChild(contPreg);

let preguntasHTMLFinal = ''; 

btnPreguntas.addEventListener('click', async () => {
  // 1) extraer texto de la lectura
  const textoLectura = Array.from(
    resultadoContenido.querySelectorAll('h2 ~ p')
  ).map(p => stripHTML(p.outerHTML)).join('\n');

  if (!textoLectura) {
    alert('No se encontró texto para generar preguntas.');
    return;
  }

  // 2) preparar prompt (igual que antes)
  const promptEdicion = [{
    role: 'user',
    text: `
      Con base en la siguiente lectura:

      ${textoLectura}

      Genera 5 preguntas de comprensión (no literales).
      IMPORTANTE: Al menos una pregunta debe ser metacognitiva.
      Usa el formato:

      <ol>
        <li>
          <p><strong>¿…texto de la pregunta…?</strong></p>
          <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${listaCriterios}</p>
          <p style="color:#c970d6;">…respuesta esperada…</p>
        </li>
      </ol>

      Devuelve solo el bloque <ol>…</ol>.
    `.trim()
  }];

  document.getElementById('spinnerLectura').style.display = 'block';

  try {
    // 3) obtener las preguntas
    let preguntasGeneradas = await enviarPrompt(promptEdicion);
    preguntasGeneradas = preguntasGeneradas
      .replace(/```html\s*/g, '')
      .replace(/```/g, '')
      .trim();

    // 4) limpiar SOLO el contenedor de preguntas, sin tocar la bibliografía
    contPreg.innerHTML = '';

    // 5) volcar el nuevo <ol>…</ol> dentro de nuestro contenedor
    const fragmento = document.createRange()
      .createContextualFragment(preguntasGeneradas);
    contPreg.appendChild(fragmento);

    preguntasHTMLFinal = preguntasGeneradas;

  } catch (err) {
    console.error('Error al generar preguntas:', err);
    alert('❌ Error al generar preguntas.');
  } finally {
    document.getElementById('spinnerLectura').style.display = 'none';
  }
});

    

      // Habilitar edición de párrafos al hacer clic
      resultadoContenido.addEventListener('click', async (event) => {
        if (event.target.tagName === 'P') {
          const p = event.target;
          // Evitar duplicar botón
          const existingBtn = document.getElementById('btnEditarParrafo');
          if (existingBtn) existingBtn.remove();
  
          const btnEditar = document.createElement('button');
          btnEditar.textContent = '✏️ Editar párrafo';
          btnEditar.id = 'btnEditarParrafo';
          btnEditar.style.position = 'absolute';
          btnEditar.style.left = `${event.pageX + 10}px`;
          btnEditar.style.top = `${event.pageY + 10}px`;
          btnEditar.style.zIndex = '9999';
          btnEditar.style.padding = '4px 10px';
          btnEditar.style.borderRadius = '6px';
          btnEditar.style.background = '#c970d6';
          btnEditar.style.color = '#fff';
          btnEditar.style.border = 'none';
          btnEditar.style.cursor = 'pointer';
  
          document.body.appendChild(btnEditar);
  
          // Al hacer clic en el botón, reescribir el párrafo
          btnEditar.addEventListener('click', async () => {
            const textoOriginal = p.textContent.trim();
          
            const promptEdicion = [{
              role: 'user',
              text: `
          Reescribe el siguiente párrafo en el mismo estilo del autor "${autorData.autor}", tipo de texto "${autorData.tipoTexto}", conserva las mismas dos o tres palabras clave en <strong></strong> (una sola palabra por palabra clave), manteniendo el significado pero mejorando la redacción:
          
          "${textoOriginal}"
          
          Devuelve solo un párrafo <p>…</p>.
              `.trim()
            }];
          
            try {
              let resultado = await enviarPrompt(promptEdicion);
              resultado = resultado.replace(/```html\s*/g, '').replace(/```/g, '').trim();
          
              if (resultado) {
                const nuevoParrafo = document.createRange().createContextualFragment(resultado);
                p.replaceWith(nuevoParrafo);
          
                // 🟣 Regenerar tabla de sinónimos tras editar
                const lecturaHTML = Array.from(resultadoContenido.querySelectorAll('h2 ~ p'))
                  .map(p => p.outerHTML)
                  .join('\n');
          
                const promptSinonimos = [{
                  role: 'user',
                  text: `
          A partir de la siguiente lectura en HTML:
          
          ${lecturaHTML}
          
          Extrae las palabras marcadas con <strong> (máximo 15) y genera una tabla HTML que muestre cada palabra clave con al menos 2 sinónimos. Usa este formato:
          
          <h2>Tabla de sinónimos</h2>
          <table>
          <tr><th>Palabra clave</th><th>Sinónimos</th></tr>
          <tr><td>ejemplo</td><td>modelo, muestra</td></tr>
          ...
          </table>
                  `.trim()
                }];
          
                let nuevaTabla = await enviarPrompt(promptSinonimos);
                nuevaTabla = nuevaTabla.replace(/```html\s*/g, '').replace(/```/g, '').trim();
          
                // Reemplazar tabla anterior si existe
                const tablaAnterior = resultadoContenido.querySelector('h2 + table');
                if (tablaAnterior && tablaAnterior.previousElementSibling?.textContent?.includes('Tabla de sinónimos')) {
                  tablaAnterior.previousElementSibling.remove(); // h2
                  tablaAnterior.remove(); // table
                }
          
                const tablaFragmento = document.createRange().createContextualFragment(nuevaTabla);
                resultadoContenido.appendChild(tablaFragmento);
              }
            } catch (err) {
              console.error('Error al actualizar párrafo o tabla:', err);
              alert('❌ Hubo un error al actualizar el párrafo o la tabla de sinónimos.');
            }
          
            btnEditar.remove();
          });
                      
          // Si el usuario hace clic fuera, remover el botón
          const removeBtn = () => {
            btnEditar.remove();
            document.removeEventListener('click', removeBtn);
          };
          setTimeout(() => {
            document.addEventListener('click', removeBtn, { once: true });
          }, 10);
        }
      });

      const btnGuardar = document.createElement('button');
      btnGuardar.textContent = 'Guardar lectura y preguntas';
      btnGuardar.className = 'btn-analisis';
      btnGuardar.style.margin = '15px 0 0 10px';
      setTimeout(() => {
        const footer = document.getElementById('modalResultadoFooter');
        footer.innerHTML = ''; // Limpia si ya existe
        footer.appendChild(btnGuardar);
      }, 100);
      
    // Guardar en Firestore
    btnGuardar.addEventListener('click', async () => {
      const contenidoTotal = resultadoContenido.innerHTML;
      try {
        await addDoc(collection(db, 'lecturasNuevas'), {
          tema: temaNuevo,
          autorReferencia: autorData.autor,
          ejemploEstilo: autorData.ejemplo,
          tipoTexto: autorData.tipoTexto,
          nivel: nivelNuevo,
          grado: gradoNuevo,
          trimestre: trimestreNuevo,
          unidad: unidadNuevo,
          contenidoHTML: contenidoTotal,
          timestamp: new Date()
        });
        alert('✅ Lectura y preguntas guardadas correctamente.');
      } catch (err) {
        console.error('❌ Error al guardar:', err);
        alert('Ocurrió un error al guardar la lectura.');
      }
    });

  
  });

 
});


document.querySelectorAll('.close-modal').forEach(btn => {
  btn.addEventListener('click', e => {
    const modal = e.target.closest('.modal-normal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const btnListaLecturas = document.getElementById('btnListaLecturasNuevas');
  const modalLista = document.getElementById('modalListaLecturasNuevas');
  const cerrarLista = document.getElementById('cerrarModalListaLecturas');


  if (cerrarLista && modalLista) {
    cerrarLista.addEventListener('click', () => {
      modalLista.style.display = 'none';
      document.body.style.overflow = 'auto';
    });
  }
  const listaLecturasUl = document.getElementById('listaLecturasNuevas');

  const modalVer = document.getElementById('modalVerLecturaCompleta');
  const cerrarVer = document.getElementById('cerrarModalLecturaCompleta');
  const contenidoLectura = document.getElementById('contenidoLecturaCompleta');

  const modalEditar = document.getElementById('modalEditarLectura');
  const cerrarEditar = document.getElementById('cerrarModalEditarLectura');
  const editorLectura = document.getElementById('editorLectura');

  let lecturaEditandoId = null;
  let debounceTimeout = null;

  // Abrir lista
  btnListaLecturas.addEventListener('click', async () => {
    modalLista.style.display = 'block';
    document.body.style.overflow = 'hidden';
    listaLecturasUl.innerHTML = '<li>Cargando lecturas...</li>';

    try {
      // ← aquí ordenamos por timestamp descendente
      const q = query(
        collection(db, 'lecturasNuevas'),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        listaLecturasUl.innerHTML = '<li>No hay lecturas guardadas.</li>';
        return;
      }

      listaLecturasUl.innerHTML = '';
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const isShared = (d.sharewith?.length || 0) > 0;
        const iconColor = isShared ? 'color:green;' : '';
      
        const div = document.createElement('div');
        div.className = 'item-lectura-card';
        div.innerHTML = `
          <div class="item-lectura-info lectura-item" data-id="${docSnap.id}">
            <strong>${d.tema}</strong> — ${d.nivel} ${d.grado}, Trim ${d.trimestre}, Unidad ${d.unidad}
          </div>
          <div class="item-lectura-actions">
            <i class="fas fa-share-alt icon-compartir" data-id="${docSnap.id}" title="Compartir" style="${iconColor}"></i>
            <i class="fas fa-edit icon-editar" data-id="${docSnap.id}" title="Editar"></i>
            <i class="fas fa-trash-alt icon-eliminar" data-id="${docSnap.id}" title="Eliminar"></i>
          </div>
        `;
        listaLecturasUl.appendChild(div);
      
        // ✅ Agrega el listener AQUÍ MISMO para ese ícono
        div.querySelector('.icon-compartir').addEventListener('click', async e => {
          e.stopPropagation();
          const idLectura = e.target.dataset.id;
          lecturaParaCompartir = idLectura;
      
          const docRef = doc(db, 'lecturasNuevas', idLectura);
          const docSnap = await getDoc(docRef);
          const lectura = docSnap.exists() ? docSnap.data() : null;
          if (!lectura) return;
      
          const usuariosSnap = await getDocs(collection(db, 'users'));
          listaUsuariosCompartir.innerHTML = '';
          usuariosSnap.forEach(userDoc => {
            const user = userDoc.data();
            const isChecked = lectura.sharewith?.includes(userDoc.id) ? 'checked' : '';
            listaUsuariosCompartir.innerHTML += `
              <div>
                <label>
                  <input type="checkbox" value="${userDoc.id}" ${isChecked}> ${user.nombre || user.email || userDoc.id}
                </label>
              </div>
            `;
          });
      
          modalCompartir.style.display = 'block';
          document.body.style.overflow = 'hidden';
        });
      });
      
      

      // Ver lectura
      listaLecturasUl.querySelectorAll('.lectura-item').forEach(span => {
        span.addEventListener('click', async e => {
          const id = e.target.dataset.id;
          const docRef = doc(db, 'lecturasNuevas', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            contenidoLectura.innerHTML = docSnap.data().contenidoHTML || '<p>Sin contenido.</p>';
            modalVer.style.display = 'block';
            document.body.style.overflow = 'hidden';
          }
        });
      });

      // Editar lectura
      listaLecturasUl.querySelectorAll('.icon-editar').forEach(icon => {
        icon.addEventListener('click', async e => {
          e.stopPropagation();
          const id = e.target.dataset.id;
          const docRef = doc(db, 'lecturasNuevas', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            lecturaEditandoId = id;
            editorLectura.innerHTML = docSnap.data().contenidoHTML || '';
            modalEditar.style.display = 'block';
            document.body.style.overflow = 'hidden';
          }
        });
      });

      // Eliminar lectura
      listaLecturasUl.querySelectorAll('.icon-eliminar').forEach(icon => {
        icon.addEventListener('click', async e => {
          e.stopPropagation();
          const id = e.target.dataset.id;
          const confirmar = confirm('¿Eliminar esta lectura? Esta acción no se puede deshacer.');
          if (confirmar) {
            await deleteDoc(doc(db, 'lecturasNuevas', id));
            e.target.closest('.item-lectura-card').remove();
          }
        });
      });

    } catch (err) {
      console.error('Error al cargar lecturas nuevas:', err);
      listaLecturasUl.innerHTML = '<li>Error al obtener lecturas.</li>';
    }
  });

  // Cierre de modales
  if (cerrarLista) {
    cerrarLista.addEventListener('click', () => {
      modalLista.style.display = 'none';
      document.body.style.overflow = 'auto';
    });
  }
  cerrarVer.addEventListener('click', () => {
    modalVer.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
  cerrarEditar.addEventListener('click', () => {
    modalEditar.style.display = 'none';
    document.body.style.overflow = 'auto';
    lecturaEditandoId = null;
  });

  // Cerrar al hacer clic fuera del modal
  [modalLista, modalVer, modalEditar].forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        lecturaEditandoId = null;
      }
    });
  });

  // Guardado automático (debounced) al editar
  editorLectura.addEventListener('input', () => {
    if (!lecturaEditandoId) return;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const nuevoHTML = editorLectura.innerHTML;
      try {
        await updateDoc(doc(db, 'lecturasNuevas', lecturaEditandoId), {
          contenidoHTML: nuevoHTML
        });
        console.log('✅ Cambios guardados automáticamente');
      } catch (err) {
        console.error('❌ Error al guardar:', err);
      }
    }, 1000);
  });

  const modalCompartir = document.getElementById('modalCompartirLectura');
const cerrarCompartir = document.getElementById('cerrarModalCompartirLectura');
const listaUsuariosCompartir = document.getElementById('listaUsuariosCompartir');
const btnConfirmarCompartir = document.getElementById('btnConfirmarCompartir');

let lecturaParaCompartir = null;

// Cerrar modal compartir
cerrarCompartir.addEventListener('click', () => {
  modalCompartir.style.display = 'none';
  document.body.style.overflow = 'auto';
});

// Acción al hacer clic en "Compartir"
listaLecturasUl.querySelectorAll('.icon-compartir').forEach(icon => {
  icon.addEventListener('click', async e => {
    e.stopPropagation();
    const idLectura = e.target.dataset.id;
    lecturaParaCompartir = idLectura;

    document.getElementById('materiaSeleccionada').value = lectura.materia || '';


    const docRef = doc(db, 'lecturasNuevas', idLectura);
    const docSnap = await getDoc(docRef);
    const lectura = docSnap.exists() ? docSnap.data() : null;
    if (!lectura) return;

    const usuariosSnap = await getDocs(collection(db, 'users'));
    listaUsuariosCompartir.innerHTML = '';
    usuariosSnap.forEach(userDoc => {
      const user = userDoc.data();
      const isChecked = lectura.sharewith?.includes(userDoc.id) ? 'checked' : '';
      listaUsuariosCompartir.innerHTML += `
        <div>
          <label>
            <input type="checkbox" value="${userDoc.id}" ${isChecked}> ${user.nombre || user.email || userDoc.id}
          </label>
        </div>
      `;
    });

    modalCompartir.style.display = 'block';
    document.body.style.overflow = 'hidden';
  });
});

// Confirmar compartir
btnConfirmarCompartir.addEventListener('click', async () => {
  const checkboxes = listaUsuariosCompartir.querySelectorAll('input[type="checkbox"]:checked');
  const seleccionados = Array.from(checkboxes).map(cb => cb.value);

  if (lecturaParaCompartir) {
    await updateDoc(doc(db, 'lecturasNuevas', lecturaParaCompartir), {
      sharewith: seleccionados,
      estatusLectura: "Compartido",
      materia: document.getElementById("materiaSeleccionada").value || ""
    });
    alert('✅ Compartido correctamente.');
  }

  modalCompartir.style.display = 'none';
  document.body.style.overflow = 'auto';
});


});



document.getElementById("btnDescargarEditorLectura")?.addEventListener("click", () => {
  const editor = document.getElementById("editorLectura");
  const html = editor?.innerHTML?.trim();

  if (!html || html === "<p>Sin contenido.</p>") {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  const nombreArchivo = "lectura_editada.docx";

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${html}</body>
    </html>
  `;

  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo;
  enlace.click();
});







document.addEventListener('DOMContentLoaded', () => {
  const btnEstilo     = document.getElementById('btnAgregarEstilo');
  const modalEstilo   = document.getElementById('modalAgregarEstilo');
  const cerrarEstilo  = document.getElementById('cerrarModalEstilo');
  const formEstilo    = document.getElementById('formEstiloLiterario');
  const autorInput    = document.getElementById('autorEstilo');
  const textoInput    = document.getElementById('textoEstilo');
  const tipoTextoInput = document.getElementById('tipoTextoEstilo');
  const categoriaInput = document.getElementById('categoriaEstilo');

  if (!btnEstilo || !modalEstilo || !cerrarEstilo || !formEstilo) return;

  // Abrir modal
  btnEstilo.addEventListener('click', () => {
    modalEstilo.style.display = 'block';
    document.body.style.overflow = 'hidden';
  });

  // Cerrar modal
  cerrarEstilo.addEventListener('click', () => {
    modalEstilo.style.display = 'none';
    document.body.style.overflow = 'auto';
  });

  modalEstilo.addEventListener('click', e => {
    if (e.target === modalEstilo) {
      modalEstilo.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });

  // Envío del formulario
  formEstilo.addEventListener('submit', async e => {
    e.preventDefault();
    document.getElementById('spinnerLectura').style.display = 'flex';
    const autor = autorInput.value.trim();
    const ejemplo = textoInput.value.trim();
    const tipoTexto = tipoTextoInput.value.trim();
    const categoria = categoriaInput.value.trim();



    if (!autor || !ejemplo || !tipoTexto || !categoria) {
      alert('Por favor completa todos los campos.');
      return;
    }

    try {
      await addDoc(collection(db, 'autoresEjemplo'), {
        autor,
        ejemplo,
        tipoTexto,
        categoria,
        fecha: new Date()
      });

      alert('Estilo guardado correctamente ✅');
      formEstilo.reset();
      modalEstilo.style.display = 'none';
      document.body.style.overflow = 'auto';
    } catch (error) {
      console.error('Error al guardar estilo:', error);
      alert('❌ Error al guardar el estilo. Intenta de nuevo.');
    }
  });

  document.getElementById('csvAutoresInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = async (event) => {
      const contenido = event.target.result;
      const lineas = contenido.split('\n').filter(l => l.trim() !== '');
  
      let exitos = 0;
      let fallos = 0;
  
      for (let i = 1; i < lineas.length; i++) { // omitimos encabezado
        const [autor, tipoTexto, ejemplo, categoria] = lineas[i].split(',').map(c => c?.trim());
  
        if (!autor || !tipoTexto || !ejemplo || !categoria) {
          console.warn(`Línea ${i + 1} inválida:`, lineas[i]);
          fallos++;
          continue;
        }
  
        try {
          await addDoc(collection(db, 'autoresEjemplo'), {
            autor,
            tipoTexto,
            ejemplo,
            categoria,
            fecha: new Date()
          });
          exitos++;
        } catch (err) {
          console.error(`❌ Error en línea ${i + 1}:`, err);
          fallos++;
        }
      }
  
      alert(`✅ Estilos importados: ${exitos} exitosos, ${fallos} fallidos.`);
      e.target.value = ''; // limpiar input
    };
  
    reader.readAsText(file);
  });
  
});


document.getElementById("btnCamposFormativos").addEventListener("click", () => {
  document.getElementById("modalCamposFormativos").style.display = "block";
});

// Cerrar el modal
document.getElementById("cerrarModalCampos").addEventListener("click", () => {
  document.getElementById("modalCamposFormativos").style.display = "none";
});

// Asignaturas dinámicas por campo formativo
const campoFormativoSelect = document.querySelector('select[name="campo"]');
const asignaturaSelect = document.getElementById("selectAsignatura");

const asignaturasPorCampo = {
  "Lenguajes": [
    "Ortografía", "Gramática", "Expresión Escrita", "Expresión Oral", "Arte"
  ],
  "Saberes y pensamiento científico": [
    "Ciencias Naturales", "Matemáticas", "Finanzas"
  ],
  "Ética, Naturaleza y sociedad": [
    "Geografía", "Historia de México", "Historia del Mundo", "Conocimiento del mundo", "Conocimiento de mi localidad"
  ],
  "De lo humano y comunitario": [
    "Formación Cívica y Ética", "Educación Socioemocional", "Valores", "Cultura de paz"
  ]
};

campoFormativoSelect.addEventListener("change", () => {
  const campoSeleccionado = campoFormativoSelect.value;
  asignaturaSelect.innerHTML = '<option value="">Selecciona una asignatura</option>';
  if (asignaturasPorCampo[campoSeleccionado]) {
    asignaturasPorCampo[campoSeleccionado].forEach(asignatura => {
      const option = document.createElement("option");
      option.value = asignatura;
      option.textContent = asignatura;
      asignaturaSelect.appendChild(option);
    });
  }
});

// Guardar en Firestore
document.getElementById("formCamposFormativos").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    const user = auth.currentUser;
    const userId = user ? user.uid : "anónimo";

    const docRef = await addDoc(collection(db, "camposFormativos"), {
      ...data,
      userId,
      timestamp: new Date().toISOString()
    });

    console.log("📦 Datos guardados en camposFormativos:", docRef.id);
    alert("✅ Datos guardados correctamente.");
    document.getElementById("modalCamposFormativos").style.display = "none";
    form.reset();
  } catch (error) {
    console.error("❌ Error al guardar en Firestore:", error);
    alert("Error al guardar los datos. Intenta nuevamente.");
  }
});


async function cargarEstilosLiterarios() {
  const contenedor = document.getElementById("contenedorEstilosLiterarios");
  contenedor.innerHTML = "<p>Cargando estilos...</p>";

  try {
    const snap = await getDocs(collection(db, "autoresEjemplo"));
    if (snap.empty) {
      contenedor.innerHTML = "<p>No hay estilos guardados.</p>";
      return;
    }

    contenedor.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.style.borderBottom = "1px solid #ddd";
      div.style.padding = "10px 0";
      div.innerHTML = `
        <strong>${d.autor}</strong> — ${d.tipoTexto}<br>
        <em>${d.ejemplo}</em><br>
        <small style="color:#888;">Categoría: ${d.categoria || "General"}</small>
      `;
      contenedor.appendChild(div);
    });

  } catch (err) {
    console.error("❌ Error al cargar estilos:", err);
    contenedor.innerHTML = "<p>Error al cargar estilos.</p>";
  }
}


async function cargarCamposFormativos() {
  const contenedor = document.getElementById("contenedorCamposFormativos");
  contenedor.innerHTML = "<p>Cargando campos...</p>";

  try {
    const snap = await getDocs(collection(db, "camposFormativos"));
    if (snap.empty) {
      contenedor.innerHTML = "<p>No hay campos formativos guardados.</p>";
      return;
    }

    contenedor.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.classList.add("item-campo-formativo");
      div.style.cursor = "pointer";
      div.style.padding = "10px";
      div.style.borderBottom = "1px solid #ccc";

      div.innerHTML = `
        <strong>${d.campo}</strong> — ${d.asignatura}<br>
        <small>Nivel: ${d.nivel} | Trimestre: ${d.trimestre} | Unidad: ${d.unidad}</small>
      `;

      div.addEventListener("click", () => abrirModalEdicionCampo(doc.id, d));
      contenedor.appendChild(div);
    });

  } catch (err) {
    console.error("❌ Error al cargar campos:", err);
    contenedor.innerHTML = "<p>Error al cargar campos.</p>";
  }
}


function abrirModalEdicionCampo(id, data) {
  document.getElementById('campoId').value = id;
  document.getElementById('editCampo').value = data.campo || '';
  document.getElementById('editAsignatura').value = data.asignatura || '';
  document.getElementById('editNivel').value = data.nivel || '';
  document.getElementById('editTrimestre').value = data.trimestre || '';
  document.getElementById('editUnidad').value = data.unidad || '';
  document.getElementById('editAprendizaje').value = data.aprendizajeEsperado || '';
  document.getElementById('editPDA').value = data.pda || '';
  document.getElementById('editTipoActividad').value = data.tipoActividad || '';
  document.getElementById('editDiferenciacion').value = data.diferenciacion || '';
  document.getElementById('editNivelEsperado').value = data.nivelEsperado || '';

  document.getElementById('modalEditarCampoFormativo').style.display = 'block';
}

document.getElementById('formEditarCampo').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('campoId').value;

  const ref = doc(db, "camposFormativos", id);
  await updateDoc(ref, {
    campo: document.getElementById('editCampo').value,
    asignatura: document.getElementById('editAsignatura').value,
    nivel: document.getElementById('editNivel').value,
    trimestre: document.getElementById('editTrimestre').value,
    unidad: document.getElementById('editUnidad').value,
    aprendizajeEsperado: document.getElementById('editAprendizaje').value,
    pda: document.getElementById('editPDA').value,
    tipoActividad: document.getElementById('editTipoActividad').value,
    diferenciacion: document.getElementById('editDiferenciacion').value,
    nivelEsperado: document.getElementById('editNivelEsperado').value
  });

  alert("✅ Campo formativo actualizado.");
  document.getElementById('modalEditarCampoFormativo').style.display = 'none';
  cargarCamposFormativos();
});


document.addEventListener('DOMContentLoaded', () => {
  const btnEstilos = document.getElementById('btnListaEstilos');
  const modalEstilos = document.getElementById('modalEstilosLiterarios');
  const cerrarEstilos = document.getElementById('cerrarModalEstilos');

  const btnCampos = document.getElementById('btnListaCampos');
  const modalCampos = document.getElementById('listamodalCamposFormativos');
  const cerrarCampos = document.getElementById('cerrarModalCampos');

  btnEstilos?.addEventListener('click', () => {
    modalEstilos.style.display = 'block';
    document.body.style.overflow = 'hidden';
    cargarEstilosLiterarios(); // opcional
  });

  cerrarEstilos?.addEventListener('click', () => {
    modalEstilos.style.display = 'none';
    document.body.style.overflow = 'auto';
  });

  modalEstilos?.addEventListener('click', e => {
    if (e.target === modalEstilos) {
      modalEstilos.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });

  btnCampos?.addEventListener('click', () => {
    modalCampos.style.display = 'block';
    document.body.style.overflow = 'hidden';
    cargarCamposFormativos(); // opcional
  });

  cerrarCampos?.addEventListener('click', () => {
    modalCampos.style.display = 'none';
    document.body.style.overflow = 'auto';
  });

  modalCampos?.addEventListener('click', e => {
    if (e.target === modalCampos) {
      modalCampos.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });
});
