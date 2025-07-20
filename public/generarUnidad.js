// generarUnidad.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { getFirestore, addDoc, collection, doc, getDoc, getDocs, updateDoc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const API_KEY = "AIzaSyA-Al10Diw6CkowW0F3EePEBD6D1h3jwxw";

function getGeminiEndpoint() {
  const modelo = document.getElementById("selectGeminiEndpoint")?.value || "gemini-1.5-pro-latest";
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}`;
}


// 🟢 Control de cola para peticiones a Gemini
let colaPrompts = Promise.resolve();

// 🟢 Retraso configurable para no saturar
const DELAY_ENTRE_PETICIONES = 2000; // 1.5 segundos entre requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


let lecturasFiltradas = [];
let secuenciaActual = {};
let unidadAnterior = null;
let contadorRecortables = 0;
let contadorFichas = 0;
let contadorAnexos = 0;
let agendaGlobal = null;
let actividadesPorUnidad = {}; 
let tablaProgramaSinteticoMostrada = false;
let notasMaestroAcumuladas = "";
let rutaYTablaInsertadasEnNotas = false;
let tituloFichaDetectada = "";
let chkFichaActivo = false;
let claveFichaActual = "";
let bloqueNotasFicha = "";
let claveFichaActualGlobal = "";
let modeloAnterior = null;
let claveAnexoActualGlobal = "";
let tablaInicialInsertada = false;

const frecuenciaSemanalPorCategoria = {
  "Artes": 1,
  "Lenguaje y comunicación": 5,
  "Ciencias experimentales": 2,
  "Ciencias sociales": 2,
  "Formación socioemocional": 1,
  "Matemáticas": 5,
};


// ✅ Crear o mostrar la consola visual
function createDebugConsole() {
  // Si ya existe, no la duplicamos
  if (document.getElementById("debugConsole")) return;

  const divDebug = document.createElement("div");
  divDebug.id = "debugConsole";
  divDebug.style.cssText = `
    position: fixed; bottom: 0; left: 2%;
    background: rgba(0,0,0,0.85); color: #0f0;
    font-family: monospace; font-size: 11px;
    padding: 8px; width: 95%; max-height: 200px;
    overflow-y:auto; z-index: 99999; border:1px solid #444; border-radius:15px;
  `;

  // ✅ Botón de cierre
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.style.cssText = `
    position:absolute; top:4px; right:8px;
    background:#f44; color:#fff; border:none;
    font-size:12px; padding:2px 6px; cursor:pointer;
    border-radius:4px;
  `;
  closeBtn.onclick = () => {
    divDebug.remove();       // quitamos la consola
    showOpenDebugButton();   // mostramos el botón flotante para abrirla
  };

  // ✅ Título superior
  const titleBar = document.createElement("div");
  titleBar.textContent = "🔍 Debug Visual";
  titleBar.style.cssText = `
    font-weight:bold; margin-bottom:4px; color:#0ff;
    padding-right:20px; text-align:left;
  `;

  divDebug.appendChild(closeBtn);
  divDebug.appendChild(titleBar);
  document.body.appendChild(divDebug);
}

// ✅ Función para loguear visualmente
function logVisual(msg) {
  const consoleDiv = document.getElementById("debugConsole");
  if (!consoleDiv) return;
  const p = document.createElement("div");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  consoleDiv.appendChild(p);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

// ✅ Crear botón flotante para volver a abrir el debug
function showOpenDebugButton() {
  if (document.getElementById("openDebugBtn")) return; // si ya está, no lo duplicamos

  const btn = document.createElement("button");
  btn.id = "openDebugBtn";
  btn.textContent = "🔍 Mostrar Debug";
  btn.style.cssText = `
    position: fixed; bottom: 10px;
    background: #222; color: #0f0; border: 1px solid #0f0;
    padding: 6px 10px; cursor: pointer; border-radius: 8px;
    font-size: 12px; z-index: 99999;
  `;

  btn.onclick = () => {
    btn.remove();        // quitamos el botón
    createDebugConsole(); // volvemos a crear la consola
  };

  document.body.appendChild(btn);
}

// ✅ Inicializa la consola al cargar
createDebugConsole();


function verificarUnidadActual() {
  const unidadActual = selectUnidad.value;
  const modeloActual = document.getElementById("selectGeminiEndpoint")?.value;
  
  if (unidadActual !== unidadAnterior || modeloActual !== modeloAnterior) {
    contadorRecortables = 0;
    contadorFichas = 0;
    contadorAnexos = 0;
    unidadAnterior = unidadActual;
    modeloAnterior = modeloActual;
    console.log(`Reiniciando contadores - Unidad: ${unidadActual}, Modelo: ${modeloActual}`);
  }
}




// Mapa de grados (texto -> número)
const gradoMap = {
  "Primero": "1",
  "Segundo": "2",
  "Tercero": "3",
  "Cuarto": "4",
  "Quinto": "5",
  "Sexto": "6"
};




// DOM
const selectNivel = document.getElementById("unidadNivel");
const selectGrado = document.getElementById("unidadGrado");
const selectTema = document.getElementById("unidadTema");
const selectTemaASC = document.getElementById("unidadTemaASC");
selectTema.addEventListener("change", () => {
  if (selectTema.value) selectTemaASC.value = "";
});

selectTemaASC.addEventListener("change", () => {
  if (selectTemaASC.value) selectTema.value = "";
});

const selectTrimestre = document.getElementById("unidadTrimestre");
const selectUnidad = document.getElementById("unidadNumero");
const contenedorCamposSecuencia = document.getElementById("camposSecuencia");
const outputResultado = document.getElementById("resultadoUnidadGenerada");



const descripcionesPorDefecto = {
    Artes: {
      T: "Exploración de diversas formas de expresión artística como dibujo, música, teatro y danza.",
      AE: "Desarrollar la capacidad de apreciar, interpretar y crear manifestaciones artísticas.",
      C: "Técnicas básicas de expresión visual, musical y corporal.",
      P: "Experimentación de medios y herramientas para crear obras personales."
    }
 /*   Finanzas: {
      T: "Fundamentos de la educación financiera desde edad temprana.",
      AE: "Reconocer el valor del dinero, ahorro, gasto responsable y planificación financiera.",
      C: "Conceptos básicos como presupuesto, ahorro y necesidades vs. deseos.",
      P: "Resolución de problemas financieros en contextos reales o simulados."
    },
    Habilidades: {
      T: "Habilidades blandas esenciales para la vida escolar y personal.",
      AE: "Fomentar la comunicación efectiva, trabajo colaborativo y toma de decisiones.",
      C: "Desarrollo de pensamiento crítico, empatía y autorregulación.",
      P: "Aplicación de habilidades socioemocionales en actividades diarias."
    } */
};
  
const categoriaPorSubtema = {
  Artes: "Artes",
  Ortografía: "Lenguaje y comunicación",
  Gramatica: "Lenguaje y comunicación",
  ExpresionEscrita: "Lenguaje y comunicación",
  ExpresionOral: "Lenguaje y comunicación",
  Naturales: "Ciencias experimentales",
  Socioemocional: "Formación socioemocional",
  CivicaEtica: "Formación socioemocional",
  Historia: "Ciencias sociales",
  Geografia: "Ciencias sociales",
  Conocimiento_del_medio: "Ciencias sociales",
  Matematicas: "Matemáticas"
 // Finanzas: "Finanzas",
  // Tecnologia: "Tecnología",
  // Habilidades: "Habilidades"
};


const btnAbrirModal = document.getElementById("btnAbrirModalUnidad");
const modalUnidad = document.getElementById("modalGenerarUnidad");
const cerrarModal = document.getElementById("cerrarModalUnidad");


// Modal
btnAbrirModal?.addEventListener("click", () => {
  modalUnidad.style.display = "block";
});

cerrarModal?.addEventListener("click", () => {
  modalUnidad.style.display = "none";
});

// Carga lecturas por nivel y grado

selectNivel?.addEventListener("change", () => {
  actualizarTemasLecturas();
  actualizarLecturasASC(); // ← 🟢 nueva llamada
})

selectGrado?.addEventListener("change", () => {
  actualizarTemasLecturas();
  actualizarLecturasASC(); // ← 🟢 nueva llamada
});

selectTrimestre?.addEventListener("change", verificarSecuencia);
selectUnidad?.addEventListener("change", verificarSecuencia);

async function actualizarTemasLecturas() {
  const nivel = selectNivel.value;
  const gradoTexto = selectGrado.value;
  const gradoNumero = gradoMap[gradoTexto];
  if (!nivel || !gradoNumero) return;

  // Lecturas desde lecturasNuevas
  const qNuevas = query(
    collection(db, "lecturasNuevas"),
    where("nivel", "==", nivel),
    where("grado", "==", gradoNumero)
  );
  const snapNuevas = await getDocs(qNuevas);
  lecturasFiltradas = snapNuevas.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  selectTema.innerHTML = "<option value=''>Selecciona</option>";
  lecturasFiltradas.forEach(l => {
    const option = document.createElement("option");
    option.value = l.id;

    const titulo = l.tema || l.titulo || "(Sin tema)";
    const autor = l.autorReferencia ? ` — ${l.autorReferencia}` : "";
    const nivel = l.nivel || "N/A";
    const grado = l.grado || "N/A";
    const trimestre = l.trimestre || "N/A";
    const unidad = l.unidad || "N/A";

    option.textContent = `${titulo}${autor} [${nivel}, ${grado}, T${trimestre}, U${unidad}]`;
    selectTema.appendChild(option);
  });

  // Lecturas desde lecturasASC
  const qASC = query(
    collection(db, "lecturasASC"),
    where("nivel", "==", nivel),
    where("grado", "==", gradoNumero)
  );
  const snapASC = await getDocs(qASC);
  lecturasASC = snapASC.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  selectTemaASC.innerHTML = "<option value=''>Selecciona</option>";
  lecturasASC.forEach(l => {
    const option = document.createElement("option");
    option.value = l.id;
    option.textContent = l.tema || l.titulo || "(Sin tema)";
    selectTemaASC.appendChild(option);
  });
}

let lecturasASC = [];

async function actualizarLecturasASC() {
  const nivel = selectNivel.value;
  const gradoTexto = selectGrado.value;
  const gradoNumero = gradoMap[gradoTexto];
  if (!nivel || !gradoNumero) return;

  const q = query(
    collection(db, "lecturasASC"),
    where("nivel", "==", nivel),
    where("grado", "==", gradoNumero)
  );
  const snap = await getDocs(q);
  lecturasASC = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  selectTemaASC.innerHTML = "<option value=''>Selecciona lectura ASC</option>";
  lecturasASC.forEach(l => {
    const option = document.createElement("option");
    option.value = l.id;

    const titulo = l.tema || l.titulo || "Sin título";
    const nivel = l.nivel || "N/A";
    const grado = l.grado || "N/A";
    const trimestre = l.trimestre || "N/A";
    const unidad = l.unidad || "N/A";

    option.textContent = `${titulo} [${nivel}, ${grado}, T${trimestre}, U${unidad}]`;
    selectTemaASC.appendChild(option);
  });
}


function generarProgramaSintetico(secuenciaActual) {
  // Columnas para cada campo formativo (Set evita duplicados)
  const columnas = {
    "Lenguajes": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "Saberes y Pensamiento Científico": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" },
    "Ética, Naturaleza y Sociedades": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "De lo Humano y lo Comunitario": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" }
  };

  // ✅ Mapeo EXACTO categoría → columna del campo formativo
  const mapeoCampoFormativo = {
    "Lenguaje y comunicación": "Lenguajes",
    "Ciencias experimentales": "Saberes y Pensamiento Científico",
    "Ciencias sociales": "Ética, Naturaleza y Sociedades",
    "Formación socioemocional": "De lo Humano y lo Comunitario"
  };

  // ✅ Recorrer la secuencia filtrada por unidad/trim/nivel
  for (const key in secuenciaActual) {
    // solo procesamos Contenido (_C)
    if (key.endsWith("_C")) {
      const subtema = key.replace("_C", "");
      const categoria = categoriaPorSubtema[subtema]; // ej: Lenguaje y comunicación
      const campoFormativo = mapeoCampoFormativo[categoria];

      // solo si el subtema tiene categoría reconocida
      if (campoFormativo && columnas[campoFormativo]) {
        const contenido = secuenciaActual[`${subtema}_C`] || "";
        const proceso = secuenciaActual[`${subtema}_P`] || "";

        if (contenido.trim()) columnas[campoFormativo].contenido.add(contenido.trim());
        if (proceso.trim()) columnas[campoFormativo].proceso.add(proceso.trim());
      }
    }
  }

  // ✅ Convertimos Sets → texto limpio
  const columnasFinales = {};
  for (const campo in columnas) {
    columnasFinales[campo] = {
      contenido: Array.from(columnas[campo].contenido).join("<br>") || "-",
      proceso: Array.from(columnas[campo].proceso).join("<br>") || "-",
      ambiente: columnas[campo].ambiente
    };
  }

  // ✅ Tabla con formato Fase 5
  return `
    <div id="programa-sintetico" style="margin-bottom:20px;">
     <p>Puede realizar el codiseño curricular a partir de la siguiente contextualización pedagógica vinculada a los contenidos relevantes de los cuatro Campos Formativos:</p>
      <h3 style="text-align:center; background:#AEEEEE; margin-bottom:10px;">Fase 5</h3>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center; font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2; font-weight:bold;">
            <th style="background:#ddebf7;"></th>
            <th style="background:#ddebf7;">Campos Formativos</th>
            <th style="background:#fff2cc;">Lenguajes</th>
            <th style="background:#CFEDEA;">Saberes y Pensamiento Científico</th>
            <th style="background:#e2efda;">Ética, Naturaleza y Sociedades</th>
            <th style="background:#f4cccc;">De lo Humano y lo Comunitario</th>
          </tr>
        </thead>
        <tbody>
          <!-- Contenidos -->
          <tr>
            <td rowspan="3" style="background:#CFEDEA; font-weight:bold; writing-mode: vertical-rl; transform: rotate(180deg);">
              Programa<br>Sintético
            </td>
            <td style="background:#ebf1de; font-weight:bold;">Contenidos</td>
            <td>${columnasFinales["Lenguajes"].contenido}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].contenido}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].contenido}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].contenido}</td>
          </tr>
          <!-- Procesos -->
          <tr>
            <td style="background:#ebf1de; font-weight:bold;">Procesos</td>
            <td>${columnasFinales["Lenguajes"].proceso}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].proceso}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].proceso}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].proceso}</td>
          </tr>
          <!-- Ambientes -->
          <tr>
            <td style="background:#CFEDEA; font-weight:bold;">Ambientes</td>
            <td>${columnasFinales["Lenguajes"].ambiente}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].ambiente}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].ambiente}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].ambiente}</td>
          </tr>
        </tbody>
      </table>
      <p><strong>Contextualización pedagógica de Lenguaje y comunicación</strong></p>
      <p>En la presente Unidad los alumnos lograrán un nivel taxonómico de Comprensión, Análisis y Aplicación en el Campo Formativo de
        Lenguajes. Los aprendizajes esperados se encuentran señalados en el Temario del Libro del Alumno.</p>
    </div>
  `;
}


function generarRutaSugerida(subtemasOrdenados) {
  // 🎨 Paleta de colores por categoría (puedes ajustarlos)
  const coloresPorCategoria = {
    "Ortografía": "#a3d3f5",          // azul claro
    "Gramatica": "#d0e6ff",           // celeste
    "ExpresionEscrita": "#c7e8b4",    // verde claro
    "ExpresionOral": "#f9d5a7",       // naranja claro
    "Socioemocional": "#f7b7c3",      // rosa
    "CivicaEtica": "#f7b7c3",         // rosa
    "Habilidades": "#d9c2f0",         // morado claro
    "Naturales": "#ffe4a1",           // amarillo
    "Historia": "#ffd7a1",            // naranja
    "Geografia": "#c3f2e4",           // verde agua
    "Conocimiento_del_medio": "#c3f2e4", 
    "Matematicas": "#b4d7ff"          // azul más intenso
  };

  const items = subtemasOrdenados.map((subtema, index) => {
    const colorFondo = coloresPorCategoria[subtema] || (index % 2 ? '#a3d3f5' : '#d0e6ff');

    return `
      <div style="display:flex;align-items:center;margin-bottom:8px;">
        <div style="
          width:28px;height:28px;
          background:${colorFondo};
          color:#333;font-weight:bold;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          margin-right:10px;">
          ${index + 1}
        </div>
        <span>${formatearSubtema(subtema)}</span>
      </div>
    `;
  }).join("");

  return `
    <div style="border-left:4px solid #4aa3df;padding-left:10px;margin:20px 0;">
      <h3 style="color:#9caa0f;margin-bottom:5px;">Ruta sugerida</h3>
      <p style="font-size:14px;line-height:1.4;">
        Esta herramienta le proporciona orientaciones para la organización de sus actividades durante la semana.
        Se propone un orden para realizar las diferentes secciones de la Unidad didáctica que puede modificar o seguir:
      </p>
      ${items}
    </div>
  `;
}

// Añadir botón para generar todas las categorías
function agregarBotonGenerarTodo() {
  const btnGenerarTodo = document.createElement("button");
  btnGenerarTodo.id = "btnGenerarTodo";
  btnGenerarTodo.textContent = "Generar todas las categorías";
  btnGenerarTodo.style.cssText = `
    background-color: #4CAF50;
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    margin: 20px 0;
    display: block;
    width: 100%;
  `;
  
  // Insertar el botón al inicio del contenedor de campos de secuencia
  contenedorCamposSecuencia.insertBefore(btnGenerarTodo, contenedorCamposSecuencia.firstChild);
  
  btnGenerarTodo.addEventListener("click", async () => {
    btnGenerarTodo.disabled = true;
    btnGenerarTodo.textContent = "Generando...";
    btnGenerarTodo.style.backgroundColor = "#cccccc";
    
    // Obtener todas las categorías disponibles
    const categorias = Array.from(document.querySelectorAll(".btn-generar-categoria"))
      .map(btn => btn.dataset.categoria)
      .filter((value, index, self) => self.indexOf(value) === index); // Eliminar duplicados
    
    // Generar cada categoría secuencialmente
    for (const categoria of categorias) {
      btnGenerarTodo.textContent = `Generando ${categoria}...`;
      await generarSeccionCategoria(categoria);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Pequeña pausa entre categorías
    }
    
    btnGenerarTodo.textContent = "¡Todas las categorías generadas!";
    setTimeout(() => {
      btnGenerarTodo.textContent = "Generar todas las categorías";
      btnGenerarTodo.style.backgroundColor = "#4CAF50";
      btnGenerarTodo.disabled = false;
    }, 3000);
  });
}


async function verificarSecuencia() {
  const nivel = selectNivel.value;
  const grado = selectGrado.value;
  const trimestre = selectTrimestre.value;
  const unidad = selectUnidad.value;
  if (!nivel || !grado || !trimestre || !unidad) return;

  const q = query(
    collection(db, "secuenciaAlcance"),
    where("nivel", "==", nivel),
    where("grado", "==", grado),
    where("trimestre", "==", trimestre),
    where("unidad", "==", unidad)
  );

  const snap = await getDocs(q);
  contenedorCamposSecuencia.innerHTML = "";

  if (snap.empty) {
    console.warn("No se encontraron resultados para la secuencia y alcance.");
    return;
  }

  secuenciaActual = snap.docs[0].data();


  const categorias = {
    "Artes": ["Artes"],
    "Lenguaje y comunicación": ["Ortografía", "Gramatica", "ExpresionEscrita", "ExpresionOral"],
    "Ciencias experimentales": ["Naturales"],
    "Ciencias sociales": [ "Historia", "Geografia", "Conocimiento_del_medio"],
    "Formación socioemocional": ["CivicaEtica", "Socioemocional"],
    "Matemáticas": ["Matematicas"]
   // "Finanzas": ["Finanzas"],
    // "Tecnología": ["Tecnologia"],
    // "Habilidades": ["Habilidades"]
  };

  // ✅ Mapeo subtema → categoría
  window.categoriaPorSubtema = {};
  for (const [cat, subs] of Object.entries(categorias)) {
    subs.forEach(sub => {
      window.categoriaPorSubtema[sub] = cat;
    });
  }

  const todosLosSubtemas = Object.values(categorias).flat();

  for (const [categoria, subtemas] of Object.entries(categorias)) {
    const tabla = document.createElement("table");
    tabla.className = "tabla-secuencia";
    tabla.style.width = "100%";
    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Categoría</th>
          <th>Subtema</th>
          <th>Relacionar con lectura</th>
          <th>Interdisciplinariedad</th>
          <th>Recortables</th>
          <th>Fichas</th>
          <th>Anexos</th>
          <th>Videos</th>
          <th># Actividades</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = tabla.querySelector("tbody");

    subtemas.forEach(subtema => {
      const chkRelacion = document.createElement("input");
      chkRelacion.type = "checkbox";
      chkRelacion.name = `relacion_${subtema}`;
      chkRelacion.checked = true;

      const selectInterdisciplinariedad = document.createElement("select");
      selectInterdisciplinariedad.name = `interdisciplinariedad_${subtema}`;
      selectInterdisciplinariedad.innerHTML = `<option value="">Ninguna</option>`;
      todosLosSubtemas.forEach(op => {
        if (op !== subtema) {
          const option = document.createElement("option");
          option.value = op;
          option.textContent = op;
          selectInterdisciplinariedad.appendChild(option);
        }
      });

      const chkRecortable = document.createElement("input");
      chkRecortable.type = "checkbox";
      chkRecortable.name = `recortable_${subtema}`;
      chkRecortable.checked = false;

      const chkFichas = document.createElement("input");
      chkFichas.type = "checkbox";
      chkFichas.name = `ficha_${subtema}`;
      chkFichas.checked = false;

      const chkAnexos = document.createElement("input");
      chkAnexos.type = "checkbox";
      chkAnexos.name = `anexo_${subtema}`;
      chkAnexos.checked = false;

      const chkVideos = document.createElement("input");
      chkVideos.type = "checkbox";
      chkVideos.name = `video_${subtema}`;
      chkVideos.checked = false;

      const inputCantidad = document.createElement("input");
      inputCantidad.type = "number";
      inputCantidad.name = `num_${subtema}`;
      inputCantidad.min = 1;
      inputCantidad.max = 10;
      inputCantidad.value = (categoria === "Artes") ? 4 : 2; // ✅ Valor por defecto
      inputCantidad.style.width = "60px";

      const fila = document.createElement("tr");

      const tdCategoria = document.createElement("td");
      tdCategoria.textContent = categoria;

      const tdSubtema = document.createElement("td");
      tdSubtema.textContent = subtema;

      const tdRelacion = document.createElement("td");
      tdRelacion.appendChild(chkRelacion);

      const tdInterdisciplinariedad = document.createElement("td");
      tdInterdisciplinariedad.appendChild(selectInterdisciplinariedad);

      const tdRecortable = document.createElement("td");
      tdRecortable.appendChild(chkRecortable);

      const tdFicha = document.createElement("td");
      tdFicha.appendChild(chkFichas);

      const tdAnexo = document.createElement("td");
      tdAnexo.appendChild(chkAnexos);
      
      const tdVideo = document.createElement("td");
      tdVideo.appendChild(chkVideos);


      const tdCantidad = document.createElement("td");
      tdCantidad.appendChild(inputCantidad);

      fila.appendChild(tdCategoria);
      fila.appendChild(tdSubtema);
      fila.appendChild(tdRelacion);
      fila.appendChild(tdInterdisciplinariedad);
      fila.appendChild(tdRecortable);
      fila.appendChild(tdFicha);
      fila.appendChild(tdAnexo);
      fila.appendChild(tdVideo);
      fila.appendChild(tdCantidad);      
      fila.appendChild(tdCantidad); // ✅ Añadir al DOM

      tbody.appendChild(fila);
    });

    const encabezado = document.createElement("div");
    encabezado.className = "categoria-header";
    encabezado.innerHTML = `
      <h3 style="display:inline-block;">${categoria}</h3>
      <button type="button" class="btn-generar-categoria" data-categoria="${categoria}" style="margin-left: 1rem;">
        Generar sección
      </button>
    `;

    contenedorCamposSecuencia.appendChild(encabezado);
    contenedorCamposSecuencia.appendChild(tabla);
  }

  setTimeout(() => {
    const inputs = contenedorCamposSecuencia.querySelectorAll("input, select");

    inputs.forEach(input => {
      const key = `unidad_${input.name}`;
      const saved = localStorage.getItem(key);

      if (input.type === "checkbox") {
        if (saved !== null) input.checked = saved === "true";
        input.addEventListener("change", () => {
          localStorage.setItem(key, input.checked);
        });
      } else {
        if (saved !== null) input.value = saved;
        input.addEventListener("change", () => {
          localStorage.setItem(key, input.value);
        });
        input.addEventListener("input", () => {
          localStorage.setItem(key, input.value);
        });
      }
    });
  }, 100); // aseguramos que todo ya está en el DOM
 
  agregarBotonGenerarTodo();
}



async function generarSeccionCategoria(categoria) {
  verificarUnidadActual();
  const lecturaId = selectTema.value || selectTemaASC.value;
  const lectura = lecturasFiltradas.find(l => l.id === lecturaId) || lecturasASC.find(l => l.id === lecturaId);
  if (!lectura) return alert("Selecciona una lectura válida.");

  const categoriaRequiereLectura = ["Artes"
    /* "Finanzas", 
     "Habilidades" */
     ].includes(categoria);

  const subtemasDeCategoria = Object.entries(categoriaPorSubtema)
    .filter(([sub, cat]) => cat === categoria)
    .map(([sub]) => sub)
    .filter(sub => {
      const chk = document.querySelector(`input[name='relacion_${sub}']`);
      return chk && chk.checked;
    });


  const contenidoLectura = lectura?.contenidoHTML || lectura?.texto || lectura?.textoLectura || "";
  const preguntasComprension = lectura?.preguntasComprension || [];

  const usarLecturaReal = categoriaRequiereLectura || subtemasDeCategoria.some(sub =>
    document.querySelector(`input[name='relacion_${sub}']`)?.checked
  );



  const objetivos = [];

  for (const subtema of subtemasDeCategoria) {
    // 🔎 Extraer datos del DOM una sola vez
    const chkRelacion = document.querySelector(`input[name='relacion_${subtema}']`);
    const relacionada = chkRelacion ? chkRelacion.checked : false;

    const inputInter = document.querySelector(`select[name='interdisciplinariedad_${subtema}']`);
    const interdisciplinariedad = !!(inputInter && inputInter.value);

    const chkRecortable = document.querySelector(`input[name='recortable_${subtema}']`);
    const recortable = chkRecortable ? chkRecortable.checked : false;



    const inputCantidad = document.querySelector(`input[name='num_${subtema}']`);
    let cantidad = inputCantidad ? parseInt(inputCantidad.value) : 1;
    if (recortable && cantidad > 2) cantidad = 2;

    // ✅ Normaliza el subtema para buscar las claves correctas
    const claveBase = subtema.replace(/\s+/g, "_"); // Ej: "Expresión Oral" → "Expresión_Oral"
    const categoria = categoriaPorSubtema[subtema] || "Artes"; // fallback a Artes si no hay

    // ✅ Descripciones por defecto según la categoría
    const fallbackCategoria = descripcionesPorDefecto[categoria] || {
      T: `Tema general de ${categoria}`,
      AE: `Aprendizaje esperado genérico para ${categoria}`,
      C: `Contenido básico relacionado con ${categoria}`,
      P: `Proceso simple para trabajar ${categoria}`
    };

    // ✅ Buscar primero en Firestore, si no usar fallback de categoría, y como último poner genérico
    const descripcionSecuencia = 
      secuenciaActual?.[`${claveBase}_T`] || 
      fallbackCategoria.T || 
      `Tema no definido para ${subtema}`;

    const descripcionAE = 
      secuenciaActual?.[`${claveBase}_AE`] || 
      fallbackCategoria.AE || 
      `Aprendizaje esperado no definido para ${subtema}`;

    const descripcionC = 
      secuenciaActual?.[`${claveBase}_C`] || 
      fallbackCategoria.C || 
      `Contenido no definido para ${subtema}`;

    const descripcionP = 
      secuenciaActual?.[`${claveBase}_P`] || 
      fallbackCategoria.P || 
      `Proceso no definido para ${subtema}`;

    

    // ⬇️ Crea los 4 objetivos por subtema (T, AE, C, P)
    objetivos.push({ subtema, tipo: "T", cantidad, descripcion: descripcionSecuencia, relacionada, interdisciplinariedad, recortable });
    objetivos.push({ subtema, tipo: "AE", cantidad, descripcion: descripcionAE, relacionada, interdisciplinariedad, recortable });
    objetivos.push({ subtema, tipo: "C", cantidad, descripcion: descripcionC, relacionada, interdisciplinariedad, recortable });
    objetivos.push({ subtema, tipo: "P", cantidad, descripcion: descripcionP, relacionada, interdisciplinariedad, recortable });
  }


  let lecturaInicialHTML = "";
  const mostrarLecturaVisual = subtemasDeCategoria.some(sub =>
    document.querySelector(`input[name='relacion_${sub}']`)?.checked
  );
  if (mostrarLecturaVisual && contenidoLectura.trim()) {
    lecturaInicialHTML = `<h2>Lectura seleccionada</h2>${contenidoLectura}<ul>${preguntasComprension.map(p => `<li>${p.pregunta}<br><span style="color:mediumvioletred;">${p.respuesta}</span></li>`).join("")}</ul>`;
  }



  // 🧹 Limpiar elementos previos si ya existen
  const contenedorCategoriaId = `contenedor-${categoria.replace(/\s/g, "-")}`;
  const viejoContenedor = document.getElementById(contenedorCategoriaId);
  if (viejoContenedor) viejoContenedor.remove();


  // ⚠️ Solo agregar la lectura si no se ha insertado antes
  let lecturaHTML = "";
  if (mostrarLecturaVisual && contenidoLectura.trim() && !document.getElementById("bloque-lectura")) {
    lecturaHTML = `<div id="bloque-lectura"><h2>Lectura seleccionada</h2>${contenidoLectura}<ul>${preguntasComprension.map(p => `<li>${p.pregunta}<br><span style="color:mediumvioletred;">${p.respuesta}</span></li>`).join("")}</ul></div>`;
  }
  
  const contenedor = document.getElementById(`contenedor-${categoria.replace(/\s/g, "-")}`);

  for (const subtema of subtemasDeCategoria) {
    const cantidad = parseInt(document.querySelector(`input[name='num_${subtema}']`)?.value || 1);
    const statusId = `spinner-${categoria}-${subtema}`;
    const bloqueId = `bloque-${categoria}-${subtema}`;
    const objetivosDelSubtema = objetivos.filter(o => o.subtema === subtema);

    // ✅ Flags de opciones
    const generarFichas = !!document.querySelector(`input[name='ficha_${subtema}']`)?.checked;
    const generarAnexos = document.querySelector(`input[name='anexo_${subtema}']`)?.checked || false;
    const generarVideos = document.querySelector(`input[name='video_${subtema}']`)?.checked || false;
    const relacionada = document.querySelector(`input[name='relacion_${subtema}']`)?.checked || false;
   
    // Buscar el contenedor dinámico para esta categoría
    let contenedor = document.getElementById(`contenedor-${categoria.replace(/\s/g, "-")}`);

    // ✅ Si NO existe, créalo dentro del resultado principal
    if (!contenedor) {
      const resultadoUnidad = document.getElementById("resultadoUnidadGenerada");
      if (!resultadoUnidad) {
        console.error("❌ No se encontró #resultadoUnidadGenerada, revisa tu HTML.");
        return;
      }

      // Creamos un contenedor vacío para esta categoría
      contenedor = document.createElement("div");
      contenedor.id = `contenedor-${categoria.replace(/\s/g, "-")}`;
      contenedor.classList.add("bloque-categoria");
      resultadoUnidad.appendChild(contenedor);
    }

    contenedor.innerHTML += `
      <p id="${statusId}"><i class="fas fa-spinner fa-spin"></i> Generando actividades para <strong>${formatearSubtema(subtema)}</strong>...</p>
      <div id="${bloqueId}"></div>
    `;


    console.log(`🔄 Subtema ${subtema} → generarFichas:`, generarFichas);

    // ✅ Ahora sí empezamos la lógica pesada
    const nivel = selectNivel.value;
    const gradoTexto = selectGrado.value; 

    // 👉 Generar primero un título creativo para este subtema
    const promptTitulo = `
      Genera SOLO UN título creativo, breve y atractivo (máximo 8 palabras) para el subtema "${formatearSubtema(subtema)}", dirigido a alumnos de ${gradoTexto}° de ${nivel}.
      
      ❗ Reglas estrictas:
      - Devuelve UN SOLO título, sin lista, sin numeración y sin ejemplos.
      - No añadas explicaciones ni comentarios.
      - No uses emojis.
      - El título debe sonar como un cuento o sección motivadora para niños y jóvenes.

      Ejemplo de formato correcto:
      El secreto de las formas
    `;

        // Tabla por subtema
    const subtemaSecuenciaHTML = `
      <table class="tabla-secuencia-individual">
        <thead>
          <tr>
            <th colspan="3">Unidad</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${categoriaPorSubtema[subtema] || "Sin categoría"}</td>
            <td>${formatearSubtema(subtema)}</td>
            <td>
              <p><strong>${objetivosDelSubtema.find(o => o.tipo === "T")?.descripcion || "N/A"}</strong></p>
              <p>${objetivosDelSubtema.find(o => o.tipo === "AE")?.descripcion || "N/A"}</p>
            </td>
          </tr>
        </tbody>
      </table>
    `;

  logVisual(`📌 Preparando prompt del título para: ${subtema}`);

    // ✅ Puedes paralelizar esta llamada si luego haces más procesamiento
    const tituloCreativoRespuesta = await enviarPrompt([{ role: "user", text: promptTitulo }]);
      logVisual(`✅ Título recibido para ${subtema}: ${tituloCreativoRespuesta}`);

    const tituloCreativoLimpio = tituloCreativoRespuesta.replace(/["]/g, '').trim();
  
  // 👉 2. USAMOS EL TÍTULO EN EL PROMPT PRINCIPAL
    const prompt = construirPromptDeCategoria(
      categoria,
      objetivosDelSubtema,
      relacionada ? contenidoLectura : "",
      relacionada ? preguntasComprension : [],
      [subtema],
      cantidad,
      generarFichas,
      generarAnexos,
      generarVideos,
      tituloCreativoLimpio  // ✅ SE LO PASAMOS AQUÍ
    );


    const resultadoUnidad = document.getElementById("resultadoUnidadGenerada");
      if (!resultadoUnidad) {
        console.error("❌ No se encontró el contenedor resultadoUnidadGenerada.");
        return;
      }

    if (!contenedor) {
      console.warn(`❌ No se encontró contenedor para la categoría ${categoria}`);
      return;
    }


    try {
      // 🔹 Generar contenido para el alumno
      const respuestaAlumno = await enviarPrompt([{ role: "user", text: prompt }]);
        logVisual(`✅ Respuesta alumno recibida (${respuestaAlumno.length} caracteres)`);

      let htmlAlumno = respuestaAlumno.replace(/```html|```/g, "").trim();

      let contadorGlobalFicha = 1; 

      const partes = htmlAlumno.split(/<div class="activity-fichas">/i);
      let resultadoHTML = partes[0]; // actividades normales

      for (let i = 1; i < partes.length; i++) {
        let fichaContent = partes[i];

        // ✅ Numerar progresivamente todas las actividades dentro de las fichas
        fichaContent = fichaContent.replace(
          /(Actividad\s*\d+\.\s*)?<p>\s*<span>\d+\.<\/span>\s*<strong>/gi,
          () => `<p><span>${contadorGlobalFicha++}.</span> <strong>`
        );

        // ✅ Simular respuesta infantil real
        fichaContent = fichaContent.replace(
          /<span style="color:mediumvioletred;">\s*Respuesta:\s*([^<]*)<\/span>/gi,
          () => {
            const ejemplosInfantiles = [
              "Yo lo hice dibujando un barco con colores.",
              "Porque la planta necesita sol y agua para crecer.",
              "Me gustó mucho escribir sobre mi mascota.",
              "Primero conté las figuras y después las coloreé.",
              "Respondí que el personaje estaba triste porque perdió su juguete."
            ];
            const ejemplo = ejemplosInfantiles[Math.floor(Math.random() * ejemplosInfantiles.length)];
            return `<span style="color:mediumvioletred;">Respuesta: ${ejemplo}</span>`;
          }
        );

        // ✅ SOLO cuando es la PRIMERA actividad de la ficha agregamos el título
        if (i === 1 && claveFichaActual) {
          // inyecta el encabezado con la clave una sola vez
          resultadoHTML += `
            <h1 style="margin-top:30px;color:#004080;">
              ${claveFichaActual}
            </h1>
            <div class="activity-fichas">${fichaContent}
          `;
        } else {
          resultadoHTML += `<div class="activity-fichas">${fichaContent}`;
        }

      if (generarFichas) {

        let actividadesNormales = resultadoHTML.match(/<div class="activity">[\s\S]*?<\/div>/gi) || [];

        // Encuentra una actividad que NO mencione recortable, anexo o video
        const idxLibre = actividadesNormales.findIndex(act => 
          !/recortable|anexo|video/i.test(act)
        );

        if (idxLibre !== -1) {
          actividadesNormales[idxLibre] = actividadesNormales[idxLibre]

          // Reconstruir el HTML reemplazando solo la actividad modificada
          resultadoHTML = resultadoHTML.replace(
            /<div class="activity">[\s\S]*?<\/div>/gi,
            () => actividadesNormales.shift()
          );
        }
      }



      }




      htmlAlumno = resultadoHTML;

    // 2. Limpiar numeración para anexos y recortables (mantener lógica original)
    htmlAlumno = htmlAlumno
      // ✅ Elimina el prefijo "Actividad N." en Anexos, Recortables y Fichas
      .replace(/Actividad\s*\d+\.?\s*(Anexo\s+visual:)/gi, '$1')
      .replace(/Actividad\s*\d+\.?\s*(Recortable\s+\d+\w*:)/gi, '$1')
      .replace(/Actividad\s*\d+\.?\s*(Ficha\s+\d+\w*:)/gi, '$1')




      // ✅ EXTRAEMOS EL TÍTULO UNA SOLA VEZ
      const tituloCreativo = tituloCreativoLimpio || formatearSubtema(subtema);
      const temaSecuencia = objetivosDelSubtema.find(o => o.tipo === "T")?.descripcion || "Tema no disponible";



      const T = objetivosDelSubtema.find(o => o.tipo === "T")?.descripcion || "N/A";
      const AE = objetivosDelSubtema.find(o => o.tipo === "AE")?.descripcion || "N/A";
      const C = objetivosDelSubtema.find(o => o.tipo === "C")?.descripcion || "N/A";
      const P = objetivosDelSubtema.find(o => o.tipo === "P")?.descripcion || "N/A";

      
      // 🔹 Generar notas del maestro con base en lo anterior
      // ✅ Primero separa actividades normales y fichas del contenido generado
      const { actividadesNormales, actividadesFichas } = extraerActividades(htmlAlumno);

      // 🔹 Construir el prompt de notas para actividades normales
      const promptNotas = construirPromptNotasMaestro(
        htmlAlumno,
        selectNivel.value,
        selectGrado.value,
        subtema,
        tituloCreativoLimpio,
        claveFichaActual
      );

        logVisual(`⏳ Generando notas del maestro para ${subtema}...`);
      const respuestaMaestro = await enviarPrompt([{ role: "user", text: promptNotas }]);
        logVisual(`✅ Notas del maestro listas para ${subtema}`);

      const htmlMaestro = respuestaMaestro.replace(/```html|```/g, "").trim();

      // ✅ Limpia etiquetas HTML que puedan romper el diseño
      const cleanHTML = html => html.replace(/<\/?(html|body|head|h2)[^>]*>/gi, '').trim();

      const htmlAlumnoLimpio = cleanHTML(htmlAlumno);
      const htmlMaestroLimpio = cleanHTML(htmlMaestro);

      // ✅ Añade notas para fichas SOLO si existen
      let notasFinalesColMaestro = htmlMaestroLimpio;
      if (actividadesFichas && actividadesFichas.length > 0) {
        const bloqueNotasFicha = generarNotasDeFichas(actividadesFichas, subtema, tituloCreativoLimpio);
        notasFinalesColMaestro += `
          <hr style="margin:20px 0;">
          <h3 style="margin-top:15px;color:#004080;">Notas adicionales para las Fichas de refuerzo</h3>
          ${bloqueNotasFicha}
        `;
      }
                logVisual(`🎉 Subtema ${subtema} renderizado completamente`);

      // ✅ etiqueta de interdisciplinariedad (esto no cambia)
      const subtemaRelacionado = document.querySelector(`select[name='interdisciplinariedad_${subtema}']`)?.value;
      const etiquetaInterdisc = subtemaRelacionado
        ? `<div class="etiqueta-interdisciplina" style="background: #c8f7c5; color: #2d7a2d; display:inline-block; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 6px;">
            Interdisc. con el subtema ${formatearSubtema(subtemaRelacionado)}
          </div><br>`
        : "";

      // ✅ Acumula la versión completa (normales + fichas)
      notasMaestroAcumuladas += notasFinalesColMaestro + "<hr>";


      // Inserta los valores T, AE, C, P justo antes de las actividades
      const bloqueObjetivosHTML = `
        <p><strong>T:</strong> ${T}</p>
        <p><strong>AE:</strong> ${AE}</p>
        <p><strong>C:</strong> ${C}</p>
        <p><strong>P:</strong> ${P}</p>
      `;

    // 🧱 Estructura con diseño de pantalla dividida para cada subtema
    let tablaProgramaHTML = "";

    // ✅ Solo generamos la tabla UNA vez
    let rutaSugerida = "";


    // 🟢 Generar Ruta sugerida + Tabla Sintética SOLO una vez
    let bloqueRutaHTML = "";
    if (!rutaYTablaInsertadasEnNotas) {
      const todosSubtemasOrdenados = Object.keys(window.categoriaPorSubtema || {});
      bloqueRutaHTML = generarRutaSugerida(todosSubtemasOrdenados);
      bloqueRutaHTML += generarProgramaSintetico(secuenciaActual);
      rutaYTablaInsertadasEnNotas = true; // ✅ ya no la volvemos a meter
    }

    document.getElementById(bloqueId).innerHTML = `
      <div class="bloque-subtema" style="display:flex; gap:20px; align-items:flex-start; margin-bottom:40px; flex-wrap:wrap;">
        <div class="col-alumno" style="flex:1; min-width:300px;">
          ${!tablaInicialInsertada ? generarTablaInicialTodasCategorias() : ""}
          <h4>${tituloCreativoLimpio}</h4>
          <h5 style="color:#666;font-weight:normal;">${T}</h5>
          ${etiquetaInterdisc}
          ${htmlAlumnoLimpio}
        </div>

        <div class="col-maestro" style="flex:1; min-width:300px; border-left:2px solid #eee; padding-left:12px;">
          <h4>${tituloCreativoLimpio}</h4>
          <h5 style="color:#666;font-weight:normal;">${T}</h5>
          ${bloqueRutaHTML}
          ${notasFinalesColMaestro}
        </div>
      </div>
    `;

    if (!tablaInicialInsertada) {
      tablaInicialInsertada = true; // ✅ Ahora ya no se volverá a insertar
    }

    // ✅ SOLO para Matemáticas, añadir la Estrategia visual
    if (categoria === "Matemáticas") {
      const estrategiaHTML = generarEstrategiaMatematica(subtema);
      document.getElementById(bloqueId).innerHTML += estrategiaHTML;
    }

    } catch (err) {
      document.getElementById(bloqueId).innerHTML = `<p style="color:red;">❌ Error al generar contenido para "${formatearSubtema(subtema)}"</p>`;
      console.error("Error al generar para", subtema, err);
    }


    document.getElementById(statusId)?.remove();
  }

  document.getElementById(`status-${categoria}`)?.remove();
  logVisual(`🎯 Categoría "${categoria}" TERMINADA Y RENDERIZADA!`);

  respuestaFinal = document.getElementById("resultadoUnidadGenerada").innerHTML;

}

function generarNotasDeFichas(actividadesFichas, subtema, tituloCreativo) {
  const claveFicha = claveFichaActualGlobal || "(Ficha no detectada)";
  let bloqueNotasFicha = `
    <h4>Fichas detectadas para ${formatearSubtema(subtema)}</h4>
    <p>Estas fichas están pensadas como actividades de refuerzo para profundizar el tema <strong>${tituloCreativo}</strong>. Se recomienda trabajarlas después de las actividades principales.</p>
  `;

  actividadesFichas.forEach((actividad, idx) => {
    const textoPlano = actividad.replace(/<[^>]*>/g, "").trim();

    // ✅ Detectar modalidad
    const modalidad = textoPlano.includes("[IC T. IND]") ? "trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "trabajo en parejas"
      : textoPlano.includes("[IC T. EQUI]") ? "trabajo en equipo"
      : "sin modalidad definida";

    // ✅ Extraer recursos adicionales si los hay
    const videoMatch = textoPlano.match(/video\s+"([^"]+)"/i);
    const recortableMatch = textoPlano.match(/recortable\s+(\d+\w*)/i);
    const anexoMatch = textoPlano.match(/anexo\s+(\d+\w*)/i);

    let recursosExtra = `Distribuya la ${claveFicha} para reforzar la actividad.`;
    if (videoMatch) recursosExtra += ` Apóyese con el video "${videoMatch[1]}".`;
    if (recortableMatch) recursosExtra += ` Entregue el ${recortableMatch[0]} para manipular el contenido.`;
    if (anexoMatch) recursosExtra += ` Muestre el ${anexoMatch[0]} como apoyo visual.`;

    // ✅ Crear narrativa tipo maestro (igual que actividades normales)
    bloqueNotasFicha += `
      <p><strong>En la actividad de refuerzo ${idx + 1}</strong>, indique a los alumnos que realizarán ${modalidad}, detalladamente como debe gestionar el aula y preparar la actividad para los alumnos. 
      ${recursosExtra} Su rol será el de guía, asegurando que comprendan la consigna y facilitando materiales necesarios. 
      Refuerce la conexión con el tema <em>${tituloCreativo}</em> mediante ejemplos cotidianos que les resulten familiares.</p>

      <p><em>Estrategia para estudiantes con barreras de aprendizaje:</em> Ofrezca apoyos visuales simplificados, plantillas pre-diseñadas o permita respuestas orales en lugar de escritas. 
      Si es necesario, organice un acompañamiento más cercano para explicar la dinámica paso a paso.</p>
    `;
  });

  return bloqueNotasFicha;
}



function generarEstrategiaMatematica(subtema) {
  return `
    <div class="estrategia-box" style="border:2px solid #cce4ff; padding:20px; margin:20px 0; border-radius:10px; background:#f9fcff;">
      <div style="display:flex; align-items:center; margin-bottom:15px;">
        <img src="personaje_estrategia.png" alt="Personaje Estrategia" style="width:80px; height:auto; margin-right:15px;">
        <div style="background:#ffeecf; padding:8px 15px; border-radius:20px; font-weight:bold; color:#555;">Estrategia</div>
      </div>

      <p style="font-weight:bold; margin-bottom:10px;">Estrategia visual para ${subtema}</p>
      
      <div style="text-align:center; margin-bottom:15px;">
        <!-- Imagen ilustrativa -->
        <img src="grafico_${subtema.toLowerCase()}.png" alt="Gráfico explicativo" style="width:100%; max-width:500px;">
      </div>

      <p>Esta estrategia ayuda a comprender ${subtema} de forma visual. Observa cómo se representan los valores y comenta con un compañero.</p>

      <p>Para resolver este tipo de problemas, primero debes 
        <span style="border-bottom:1px solid #000; display:inline-block; min-width:200px;"></span>
      </p>

      <p style="margin-top:10px;">Observa el video <em>“${subtema}”</em> que te mostrará tu profesor(a).</p>
    </div>
  `;
}

function formatearSubtema(nombre) {
  const reemplazos = {
    "ExpresionOral": "Expresión Oral",
    "ExpresionEscrita": "Expresión Escrita",
    "ComprensionLectora": "Comprensión Lectora",
    "ConvencionesLinguisticas": "Convenciones Lingüísticas",
    "Gramatica": "Gramática",
    "Ortografia": "Ortografía",
    "Conocimiento_del_medio": "Conocimiento del medio",
    "CivicaEtica": "Formación Cívica y Ética",
  };
  return reemplazos[nombre] || nombre.replace(/([a-z])([A-Z])/g, '$1 $2');
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-generar-categoria");
  if (!btn) return;
  const categoria = btn.dataset.categoria;
  if (categoria) {
    generarSeccionCategoria(categoria);
  }
});

// ✅ Objeto global para mantener contadores por unidad y tipo
// Objeto global para contadores por unidad
window.contadoresPorUnidad = window.contadoresPorUnidad || {};

function getContadoresUnidad(unidad) {
  if (!window.contadoresPorUnidad[unidad]) {
    window.contadoresPorUnidad[unidad] = { fichas: 0, recortables: 0, anexos: 0 };
  }
  return window.contadoresPorUnidad[unidad];
}

function obtenerClaveFicha(unidad) {
  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.fichas); // 'a', 'b', ...
  const clave = `Ficha ${unidad}${letra}`;
  contadores.fichas++;
  window.claveFichaActualGlobal = clave;
  window.chkFichaActivo = true;
  console.log(`✅ Nueva ficha generada: ${clave}`);
  return clave;
}

function obtenerClaveRecortable(unidad) {
  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.recortables);
  const clave = `Recortable ${unidad}${letra}`;
  contadores.recortables++;
  console.log(`✅ Nuevo recortable generado: ${clave}`);
  return clave;
}

function obtenerClaveAnexo(unidad) {
  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.anexos);
  const clave = `Anexo ${unidad}${letra}`;
  contadores.anexos++;
  console.log(`✅ Nuevo anexo generado: ${clave}`);
  return clave;
}


function construirPromptDeCategoria(categoria, objetivos, contenidoLectura, preguntasComprension, nombresSubtemas = [], cantidad = 4, generarFichas = false, generarAnexos = false, generarVideos = false, tituloCreativo = "", promptTitulo, ) {
  const nivel = selectNivel.value;
  const grado = selectGrado.value;
  const subtemaClave = nombresSubtemas[0];
  const tituloFinal = tituloCreativo || formatearSubtema(subtemaClave);  
  const subtemaFormateado = formatearSubtema(subtemaClave);
  const unidadActual = selectUnidad.value || "1";
  let claveRecortable = "";
  let claveAnexo = "";
  const objetivosAgrupados = {};
  const objetivosDelSubtema = objetivos.filter(o => o.subtema === subtemaClave);

  // 1. Verificación doble de opciones (parámetros y DOM)
  const checkboxFichas = document.querySelector(`input[name='ficha_${subtemaClave}']`);
  const checkboxAnexos = document.querySelector(`input[name='anexo_${subtemaClave}']`);
  const checkboxVideos = document.querySelector(`input[name='video_${subtemaClave}']`);
  const checkboxRecortable = document.querySelector(`input[name='recortable_${subtemaClave}']`);

  const generarFichasFinal = (generarFichas || (checkboxFichas && checkboxFichas.checked));
  const generarAnexosFinal = (generarAnexos || (checkboxAnexos && checkboxAnexos.checked));
  const generarVideosFinal = (generarVideos || (checkboxVideos && checkboxVideos.checked));
  const tieneRecortable = (objetivosDelSubtema.some(o => o.recortable) || (checkboxRecortable && checkboxRecortable.checked));

  console.log(`Configuración para ${subtemaClave}:`, {
    fichas: generarFichasFinal,
    anexos: generarAnexosFinal,
    videos: generarVideosFinal,
    recortable: tieneRecortable
  });

  objetivosDelSubtema.forEach(o => {
    if (!objetivosAgrupados[o.subtema]) objetivosAgrupados[o.subtema] = {};
    objetivosAgrupados[o.subtema][o.tipo] = o;
  });

  const T = objetivosAgrupados[subtemaClave]?.T?.descripcion || "Tema no disponible";
  const AE = objetivosAgrupados[subtemaClave]?.AE?.descripcion || "Aprendizaje esperado no disponible";
  const C = objetivosAgrupados[subtemaClave]?.C?.descripcion || "Contenido no disponible";
  const P = objetivosAgrupados[subtemaClave]?.P?.descripcion || "Proceso no disponible";

  const subtemaRelacionado = document.querySelector(`select[name='interdisciplinariedad_${subtemaClave}']`)?.value || "";
  const notaInterdisc = subtemaRelacionado
    ? `Este subtema debe relacionarse con el subtema interdisciplinario "${formatearSubtema(subtemaRelacionado)}".`
    : "";

  const competencias = `
1. **Para Matemáticas**:
   - Conceptos matemáticos: Investigar ideas básicas utilizando métodos inductivos y deductivos.
   - Retos matemáticos: Convertir el salón en un taller de solución de problemas.
   - Lógica matemática: Fomentar el pensamiento abstracto y metacognición.
   - Experimentación matemática: Aplicar conceptos matemáticos a situaciones reales.
   - Usa, tablas de valor posicional, Juegos de basta, Tablas de fracciones, uso de menor y mayor qué, etc...
   - Usa un nivel alto de complejidad y actividades de pre-requisito y ampliación.
   - Actividades con Sentido numérico y pensamiento algebraico.

2. **Para Lenguaje y comunicación**:
   - Expresión oral: Fomentar la fluidez verbal y el conocimiento del destinatario.
   - Expresión escrita: Desarrollar habilidades en redacción, ortografía y caligrafía.
   - Comprensión lectora: Incrementar las habilidades de comprensión y razonamiento verbal.
   - Convenciones lingüísticas: Dominio de gramática, sintaxis y literatura.

3. **Para Ciencias experimentales**:
   - Conceptos científicos: Construir glosarios y diagramas para visualizar conceptos.
   - Experimentación: Aplicar la ciencia con un enfoque en la salud y el ambiente.
   - Pensamiento científico: Desarrollar teorías y aplicarlas en la vida real.
   - Interdisciplinariedad: Relacionar ciencias con otras asignaturas.

4. **Para Ciencias sociales**:
   - Historia de paisajes y convivencia de mi comunidad
   - Conceptos sociales: Conceptualizar y abstraer ideas sociales.
   - Formación cultural: Elaborar comparaciones de culturas y sus aportaciones.
   - Gestión de la información: Analizar datos y usar diversas fuentes de información.
   - Actitudes y valores: Desarrollar posturas personales basadas en la historia y cultura.
  `;

  const tipoActividad = `
  1. tipos de Actividades: Incluir variedad: opción múltiple, completar, dramatizar, construir, recortar, ordenar, escribir, etc.
  `;
  
  
  
  const tituloVideoGenerado = `Exploración submarina y el periscopio`; 


  // Obtener clave real usando la función obtenerClaveFicha
  const claveFichaActual = obtenerClaveFicha(unidadActual);
      // Recursos seleccionados
  const recursosOrdenados = [];
  if (generarFichasFinal) recursosOrdenados.push(`la ${claveFichaActual}`);
  if (generarAnexosFinal) recursosOrdenados.push(`el ${claveAnexo}`);
  if (tieneRecortable) recursosOrdenados.push(`el ${claveRecortable}`);
  if (generarVideosFinal) recursosOrdenados.push(`el video "${tituloVideoGenerado}"`);
  const claveFichaUsadaPrompt = claveFichaActual;

  const instruccionRecursos = recursosOrdenados.length > 0
    ? `IMPORTANTE: Cada uno de estos recursos debe usarse en **UNA sola actividad normal** y no repetirse:
  ${recursosOrdenados.map((r, idx) => `- Actividad ${idx + 1}: usa ${r}`).join("\n")}

  No vuelvas a mencionar estos recursos en otras actividades.
  - Ejemplos correctos:
    * "Usa el recortable ${claveRecortable} para apoyar la actividad..."
    * "Refuerza tu aprendizaje usando la ${claveFichaActualGlobal}..."
    * "Consulta el anexo visual ${claveAnexo} para resolver esta actividad..."
    * "Mira el video '${tituloVideoGenerado}' y responde..."

  ⚠️ Las demás actividades normales NO deben volver a mencionar estos recursos.` 
    : "";



  let extraBloquesFinales = "";

  

  if (generarFichasFinal) {
    window.claveFichaActualGlobal = claveFichaActual;
    window.chkFichaActivo = true;

    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 ficha con 4 actividades:
       - Clave: <strong>${claveFichaActual}</strong>
      - Usar MISMO formato que actividades normales pero con clase "activity-fichas"
      - asegurate que esta ficha se mencione en la instrucción de la actividad del subtema
      - Esta ficha debe complementar, reforzar y profundizar el mismo tema de la actividad normal en la que fue mencionada.  
      - Usa ejercicios diferentes pero relacionados, que ayuden a ampliar la comprensión, dar más ejemplos y facilitar el dominio del concepto.  
      - Si la actividad hablaba de un objeto, proceso o concepto específico, cada una de las 4 actividades de la ficha debe mantener ese mismo enfoque temático.

      - Cada actividad debe seguir esta estructura:
        <div class="activity-fichas">
          <p><span>1.</span> <strong>Instrucción principal.</strong> [IC T. IND]</p>
          <ol>
            <li>Subactividad a)</li>
            <li>Subactividad b)</li>
          </ol>
          <p><span style="color:mediumvioletred;">colocar la respuesta esperada acerca del ejercicioo anterior</span></p>
        </div>
      - La numeración de las fichas NO DEBE continuar la numeración global de las actividades normales,
      - por ejemplo si la última actividad normal fue la 4, la primera de la ficha será la 1.
      - NO uses "Actividad X" en fichas, solo el número con punto.
      - NUNCA usar "Actividad X." en las fichas
    `;

  }

  

if (generarAnexosFinal) {
  claveAnexo = `Anexo ${unidadActual}${String.fromCharCode(97 + contadorAnexos)}`;
  contadorAnexos++;
  claveAnexoActualGlobal = claveAnexo;
  extraBloquesFinales += `
    🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 anexo visual:
    - Clave: <strong>${claveAnexo}</strong>
    - Formato: <div class="activity">...</div>
    - Descripción visual detallada para reforzar el conocimiento de la actividad
    - Puede ser tablas comparativas, esquemas, mapas conceptuales, etc.
    - NO OMITIR ESTO BAJO NINGUNA CIRCUNSTANCIA

    Ejemplo de estructura:
    <div class="activity" style="margin-top:30px;">
      <strong>Anexo visual: ${claveAnexo} - [tema del anexo]</strong>
      <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-left:4px solid #6c63ff;">
        <p><em>Descripción detallada del material visual:</em></p>
        [Aquí va el contenido detallado del anexo]
        <p style="margin-top:8px;">Este anexo sirve como <strong>referencia visual</strong> para apoyar la comprensión.</p>
      </div>
    </div>
    `;
    recursosOrdenados.push(`el anexo visual ${claveAnexo}`);
  }


  if (generarVideosFinal) {
    extraBloquesFinales += `
    🚨 CONFIRMACIÓN FINAL OBLIGATORIA:
    - Si generarVideos = true → SIEMPRE genera **exactamente UN guion de video en tabla HTML al final del subtema**.
   

  IMPORTANTE: SOLO UNA ACTIVIDAD debe usar el **video "Experimento del ciclo del agua"** (o similar).  
  - Menciónalo en el enunciado: "Mira el video "${tituloVideoGenerado}" y responde...".  
  - Al final del subtema, genera el guion del video a partir de una pregunta generadora (o detonadora) dentro de un <div class="activity">, en formato HTML estructurado.

  GUION PROFESIONAL DE VIDEO:
  - El guion debe ser divertido, entretenido y captar la atención del alumno en todo momento.
  - Usa lenguaje dinámico, preguntas curiosas y narrativas que sorprendan o inviten a pensar.
  - Incluye datos útiles, curiosidades, analogías, y recursos visuales llamativos.
  - Usa cambios de voz, sonido, música de fondo o efectos mencionados en las transiciones para mantener el interés.
  - El video debe reforzar, explicar o ampliar el conocimiento del tema tratado en la actividad.
  - Estructura el guion en una tabla HTML con las siguientes columnas:
    - **Tiempo (segundos):** Duración de la escena (usa solo 4, 6 u 8 segundos por escena; total entre 50 y 60 segundos).
    - **Guion:** Texto que dice el narrador/personaje, siempre breve, atractivo y relevante.
    - **Transición:** Indica cómo cambia la escena (ejemplo: "Zoom rápido a una nube", "Sonido de gotas", "Cambio de color de fondo", etc.).
    - **Elemento visual:** Describe detalladamente qué aparece en pantalla (ejemplo: "Dibujo animado de nube feliz soltando gotas", "Mapa animado", "Dato curioso en pantalla", etc.).
  - Finaliza el guion con una frase motivacional o divertida relacionada con el tema.
  - No incluyas ejercicios, preguntas ni instrucciones fuera del guion.
  - No incluir emojis.
  - Ejemplo de tabla para guion de video:
  <div class="activity" style="margin-top:30px;">
    <strong>Guion de video: "${tituloVideoGenerado}"</strong>
    <table border="1" cellpadding="6" style="width:100%; margin-top:10px;">
      <tr style="background:#eaeaea;">
        <th>Tiempo</th>
        <th>Guion</th>
        <th>Transición</th>
        <th>Elemento visual</th>
      </tr>
      <tr>
        <td>0-6s</td>
        <td>¿Sabías que el agua viaja por todo el planeta sin parar? ¡Vamos a descubrir cómo!</td>
        <td>Zoom animado desde el océano a una nube.</td>
        <td>Animación de gotas subiendo y nube sonriente.</td>
      </tr>
      <tr>
        <td>6-12s</td>
        <td>El sol calienta el mar y el agua se convierte en vapor, ¡como magia!</td>
        <td>Sonido de burbujeo, cambio a vapor.</td>
        <td>Vapor subiendo desde el mar, sol animado guiñando el ojo.</td>
      </tr>
      <tr>
        <td>12-18s</td>
        <td>Las nubes se llenan y, cuando no aguantan más, ¡llueve!</td>
        <td>Efecto de lluvia, cambio de música alegre.</td>
        <td>Nube explotando en gotas, plantas felices recibiendo agua.</td>
      </tr>
      <tr>
        <td>...etc...</td>
        <td>Dato curioso: El ciclo del agua nunca se detiene, ¡te acompaña cada día!</td>
        <td>Animación de ciclo infinito, música divertida.</td>
        <td>Gráfico de ciclo con flechas girando y personajes animados.</td>
      </tr>
      <tr>
        <td>54-60s</td>
        <td>¡Ahora sabes por qué nunca te quedas sin agua! ¿Listo para la próxima aventura?</td>
        <td>Desvanecimiento a fondo colorido y sonido de aplausos.</td>
        <td>Personaje principal haciendo gesto de despedida.</td>
      </tr>
    </table>
    <p style="margin-top:10px;"><em>Recuerda: ¡El agua es vida, cuídala y sigue aprendiendo!</em></p>
  </div>
  `;
  }


  if (tieneRecortable) {
    claveRecortable = obtenerClaveRecortable(unidadActual);
    console.log(`Recortable generado: ${claveRecortable}`);

    extraBloquesFinales += `
    🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 recortable:
    - Clave: <strong>${claveRecortable}</strong>
    - Formato: <div class="activity">...</div>
    - Descripción visual completa de la actividad recortable, usar tarjetas, tablas, etc, para crear la actividad recortable
    - Describe detalladamente el recortable de forma visual: explica cada tarjeta, imagen, pieza, color, texto, forma y tamaño, indicando el texto que llevan y el color o forma.  
    - Si hay categorías, grupos o instrucciones de uso, descríbelos con claridad.  
    - Esta sección se va a recortar y pegar en la actividad que lo solicite, por lo que se debe considerar tamaño reducido para poder pegarlo en el libro de actividades.  
    - No incluir emojis.
    `;
  }

  const seccionesExtra = `
  ✅ Si el subtema lo amerita, agrega **una sola sección extra** al final de las actividades (pero no ambas), siguiendo una de estas opciones, siempre en formato profesional y adecuado:

  1. <div class="activity" style="margin-top:30px;">
     <strong>Para saber más.</strong>
     <p>Si hay un término o concepto importante que convenga reforzar, incluye una breve explicación de 1 a 2 líneas en lenguaje sencillo y directo, que ayude a consolidar el conocimiento.</p>
     <p><em>Ejemplo: "La fotosíntesis es el proceso por el cual las plantas convierten la luz solar en energía para vivir."</em></p>
  </div>

  2. <div class="activity" style="margin-top:30px;">
     <strong>El poder de la voz.</strong>
     <blockquote style="border-left: 4px solid #2196f3; padding-left:12px; margin:12px 0; font-style:italic; background:#f4f7fc;">
        "La educación es el arma más poderosa que puedes usar para cambiar el mundo."
        <br>
        <span style="font-weight:bold;">Nelson Mandela</span>
     </blockquote>
  </div>
  ⚠️ IMPORTANTE: No incluyas ambas. Solo una sección y solo si verdaderamente aporta al subtema. Si no aplica, omite esta sección.
  - No incluyas frases religiosas, controversiales, violentas o anónimas.
  - No incluir emojis
  `;

  const tituloCreativoPrompt = `
  Antes de generar las actividades, crea un título breve y atractivo (máximo 8 palabras) para el subtema "<strong>${subtemaFormateado}</strong>" que sea motivador para los estudiantes y conecte con las actividades.  

  ❗ Reglas del título:  
  - Debe ser claro y atractivo para niños de ${grado}° de ${nivel}.  
  - Evita signos de interrogación o exclamación.  
  - No uses emojis ni comillas.  
  - Debe sonar como un título de cuento o sección divertida del libro.  
  - Ejemplos:  
    - "Palabras que cuentan historias"  
    - "El secreto de las formas"  
    - "Exploradores del mar profundo"
  `;

  const ejeArticulador = `
  - <strong>Inclusión</strong>: Busca garantizar el derecho a la educación de todas y todos, reconociendo y valorando la diversidad cultural, lingüística, social y de capacidades.
  - <strong>Pensamiento Crítico</strong>: Fomenta la capacidad de analizar, cuestionar y reflexionar sobre la realidad, desarrollando habilidades para la toma de decisiones informadas y responsables.
  - <strong>Interculturalidad Crítica</strong>: Promueve el diálogo y el respeto entre diferentes culturas, reconociendo las desigualdades históricas y estructurales.
  - <strong>Igualdad de Género</strong>: Impulsa la equidad entre mujeres y hombres, cuestionando estereotipos y roles de género.
  - <strong>Vida Saludable</strong>: Fomenta hábitos y estilos de vida que favorezcan el bienestar físico, emocional y social.
  - <strong>Apropiación de las Culturas a través de la Lectura y la Escritura</strong>: Valora la lectura y la escritura como medios para acceder al conocimiento, expresar ideas y fortalecer la identidad cultural.
  - <strong>Artes y Experiencias Estéticas</strong>: Incorpora las manifestaciones artísticas y culturales en el proceso educativo, estimulando la creatividad y la apreciación estética.
  `;

  // 🔹 Primero define las posibles habilidades (PROCESO, PRODUCTO, CONTENIDO)
  const habilidades = {
    procesos: {
      'C': 'Captación',
      'M': 'Memoria',
      'E': 'Evaluación',
      'N': 'Producción convergente',
      'D': 'Producción divergente'
    },
    productos: {
      'U': 'Unidades',
      'C': 'Clases',
      'R': 'Relaciones',
      'S': 'Sistemas',
      'T': 'Transformaciones',
      'I': 'Implicaciones'
    },
    contenidos: {
      'F': 'Figurativos',
      'S': 'Simbólicos',
      'M': 'Semánticos'
    }
  };

  // 🔹 Función para generar una habilidad aleatoria (Proceso + Producto + Contenido)
function generarHabilidad() {
  const proceso = Object.keys(habilidades.procesos)[Math.floor(Math.random() * 5)]; // 0-4
  const producto = Object.keys(habilidades.productos)[Math.floor(Math.random() * 6)]; // 0-5
  const contenido = Object.keys(habilidades.contenidos)[Math.floor(Math.random() * 3)]; // 0-2
  return `${proceso}${producto}${contenido}`; // Ejemplo: ERM, CSF, NIM...
}

  // 🔹 Función para generar ejemplos por clave de habilidad
  function generarEjemploHabilidad(clave) {
    const ejemplos = {
      'ERM': 'Evaluar las relaciones entre conceptos semánticos en un texto.',
      'CSF': 'Identificar sistemas visuales (figurativos) en un diagrama.',
      'MUF': 'Memorizar unidades figurativas como símbolos o imágenes clave.',
      'NIM': 'Resolver problemas que implican inferencias semánticas.'
    };
    return ejemplos[clave] || 'Actividad diseñada para desarrollar esta combinación de habilidades.';
  }

  // 🔹 Función para crear el bloque visual HTML de la habilidad
  function generarBloqueHabilidad(habilidadClave) {
    return `
      <div class="habilidad-contexto" style="margin-top:20px; margin-bottom:30px; padding:12px; background:#f0f7ff; border-left:4px solid #4a90e2;">
        <h4>Habilidad Cognitiva Asociada ${habilidadClave}</h4>
        <p> → 
          ${habilidades.procesos[habilidadClave[0]]} + 
          ${habilidades.productos[habilidadClave[1]]} + 
          ${habilidades.contenidos[habilidadClave[2]]}
        </p>
        <p style="font-size:0.95em; color:#555;"><em>Ejemplo de aplicación:</em> ${generarEjemploHabilidad(habilidadClave)}</p>
      </div>
    `;
  }


  const habilidadSubtema = generarHabilidad(); 

  // ✅ Creamos el bloque HTML
  const bloqueHabilidadHTML = generarBloqueHabilidad(habilidadSubtema);

  // ✅ Lo juntamos con los bloques extra (fichas, anexos, videos)
  const bloqueDespuesActividades = `
    ${bloqueHabilidadHTML}
    ${extraBloquesFinales}
  `;



  const prompt = `
    <h1><strong>${subtemaFormateado}</strong></h1>
    ${bloqueHabilidadHTML}
    Importante: solo devolver el resultado, sin comentarios extras.
    Analiza el contenido de la lectura:
    ${contenidoLectura}

    🎯 Crea exactamente ${cantidad} actividades pedagógicas didácticas que prioricen la habilidad, exclusivamente para el subtema "<strong>${subtemaFormateado}</strong>" <strong>${habilidadSubtema}</strong>, de nivel "<strong>${nivel}</strong>" y grado "<strong>${grado}</strong>", en formato HTML estructurado.
    - Proceso: ${habilidades.procesos[habilidadSubtema[0]]}
    - Producto: ${habilidades.productos[habilidadSubtema[1]]}
    - Contenido: ${habilidades.contenidos[habilidadSubtema[2]]}

    - Tema (T): ${T}
    - Aprendizaje Esperado (AE): ${AE}
    - Contenido (C): ${C}
    - Proceso (P): ${P}

    IMPORTANTE: Siempre usar un formato HTML estructurado.

    ${notaInterdisc}
    ${instruccionRecursos}
    ${extraBloquesFinales}

    Ten en cuenta también estas competencias:
    ${competencias}
    Metodología y recursos disponibles:
    ${tipoActividad}

    Si hay una ficha activa para este subtema (${claveFichaActual}):
      - SOLO una de las actividades normales debe mencionar explícitamente la ficha diciendo:
      - Las demás actividades normales NO deben mencionar la ficha.

    🚫 IMPORTANTE: Solo una actividad puede utilizar cada uno de los siguientes recursos (si se seleccionaron):
    - ficha "${claveFichaActual}"
    - anexo "..."
    - video "..."
    - recortable "..."
    No repitas su uso. El resto de actividades deben ser independientes.

    IMPORTANTE: 
    - si está seleccionado, UNA actividad normal debe usar el recurso ficha
    - si está seleccionado,  UNA actividad normal debe usar el recurso recortable 
    - si está seleccionado, una actividad normal debe usar el recurso anexo visual
    - si está seleccionado,  UNA actividad normal debe usar el recurso video

    Cada recurso debe mencionarse explícitamente en UNA sola actividad, por ejemplo:
      *"Usa el recortable Recortable 1a para apoyar la actividad…"*
      *"Refuerza tu aprendizaje usando la ficha 1a"*
      *"Consulta el anexo visual para resolver esta actividad…"*
      *"Mira el video … y responde…"*

    Las demás actividades NO deben repetir estos recursos.

    ${instruccionRecursos}


    🚨 IMPORTANTE: Antes de escribir cada actividad, decide si la actividad se realizará y usará los siguientes identificadores de trabajo en:
    - Trabajo individual
    - Trabajo en parejas
    - Trabajo en equipo

    Y agrega INMEDIATAMENTE después de la instrucción principal, dentro del mismo párrafo <p>**, el identificador de trabajo:
    - [IC T. IND] para trabajo individual
    - [IC T. PAR] para trabajo en parejas
    - [IC T. EQUI] para trabajo en equipo

    Ejemplo:
    <p><span>1.</span> <strong>Escribe un diario de abordo describiendo la experiencia en el submarino.</strong> Puedes realizar dibujos y colorearlos para mejororar tu tarea.m [IC T. IND]</p>

    ✅ Regla: 
    - La **primera actividad** de cada subtema debe tener obligatoriamente un identificador al final de la instrucción de la actividad.  
    - Las demás actividades solo si cambian de modalidad también al final de la instrucción de la actividad.  
    - NO pongas más de un identificador por actividad.
  IMPORTANTE: cada actividad debe tener su instrucción y los pasos para realizar el ejercicio ó las preguntas metacognitivas

    INSTRUCCIONES DE ESTILO Y ESTRUCTURA:
      
    - Estructura bien cada párrafo: cada idea o subinstrucción en un nuevo párrafo si corresponde.
    - Usa <em>itálica</em> (etiqueta <em>) para ejemplos, frases metacognitivas, aclaraciones o reflexiones dentro de la instrucción.
    - La respuesta correcta o esperada debe ir SIEMPRE debajo de la actividad, usando <span style="color:mediumvioletred;">...respuesta...</span> (máx. 16-20 palabras).
    - Cada actividad va en un <div class="activity">.
    - El texto de cada actividad debe ser claro y fácil de entender, PERO el ejercicio debe ser complejo, de alto nivel, que ponga a pensar a alumnos y docentes.
    - Máximo 50 a 70 palabras por actividad.
    - Cada actividad debe contar con su instrucción y sus ejercicios.
      
    IMPORTANTE: 
      - Asegúrate de que al menos una actividad fomente la <strong>transferencia del conocimiento</strong> a contextos nuevos o situaciones reales.
      - Otra actividad debe invitar a la reflexión crítica o discusión grupal. Usa analogías, comparaciones, contrastes o toma de decisiones justificadas.
      - Incluye al menos una pregunta metacognitiva en <em>itálica</em> (ejemplo: <em>¿Cómo lo resolviste?, ¿Qué aprendiste?, ¿Qué harías diferente?</em>).

      - Incluye una actividad que promueva habilidades socioemocionales o uso del Cuadernillo de Valores.
      - Usa diferentes tipos de ejercicios: opción múltiple, completar, escribir, ordenar, relacionar, etc.
      - Incluye el Eje articulador ${ejeArticulador} en Cada subtema con actividades que más se ajuste a la actividad.
      - El aprendizaje debe ser guiado, autónomo y adaptado al nivel de los estudiantes.

    IMPORTANTE: Las actividades deben enfocarse en los niveles superiores de la Taxonomía de Bloom: <strong>analizar, evaluar, crear</strong>.

      - Asegúrate de detallar bien el Recortable, ficha, anexo, video ${extraBloquesFinales}
      - ${seccionesExtra}
      - ven las actividades que usen Recortables, asegura de añadir el espacio para pegar el recortable en el ejercicio correspondiente

      Respuesta esperada:
      -  La respuesta esperada SIEMPRE debe ser un ejemplo resuelto, CONCRETO y ESPECÍFICO, como si fuera escrito por un alumno.  
      -   Nunca digas “la respuesta puede ser…” ni des instrucciones genéricas.  
      -  Usa máximo 16 a 20 palabras.  
      - Ejemplo correcto:  
      - <span style="color:mediumvioletred;">Respuesta: Los verbos en infinitivo son navegar, explorar y descubrir nuevos lugares en el mar.</span>  
      - Ejemplo incorrecto (NO usar):  
        <span style="color:mediumvioletred;">Respuesta: subraya los verbos infinitivos.</span>


   
        ${bloqueDespuesActividades}


      **NUEVO FORMATO UNIFICADO PARA ACTIVIDADES:**
      <div class="activity">
        <p>1. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol class="steps">
          <li>Subpasos o preguntas específica</li>
          <li>Pregunta metacognitiva solo si se requiere</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [Breve ejemplo de respuesta esperada de la actividad anterior]</span>
        </div>
      </div>

  ** Ejemplo de Plantilla solo para estrategias matemáticas

  <div class="estrategia-box" style="border:2px solid #cce4ff; padding:20px; margin:20px 0; border-radius:10px; background:#f9fcff;">
    <div style="display:flex; align-items:center; margin-bottom:15px;">
      <img src="personaje_estrategia.png" alt="Personaje Estrategia" style="width:80px; height:auto; margin-right:15px;">
      <div style="background:#ffeecf; padding:8px 15px; border-radius:20px; font-weight:bold; color:#555;">Estrategia</div>
    </div>

    <p style="font-weight:bold; margin-bottom:10px;">Descripción gráfica de comparación y suma de fracciones</p>
    
    <div style="text-align:center; margin-bottom:15px;">
      <!-- Aquí va la representación gráfica -->
      <img src="grafico_fracciones.png" alt="Gráfico de fracciones" style="width:100%; max-width:500px;">
    </div>

    <p>Identifica en los arreglos rectangulares las partes de las dos fracciones. Comenta su significado con un compañero.</p>

    <p>Para sumar o comparar dos fracciones con diferente denominador, primero se tiene que 
      <span style="border-bottom:1px solid #000; display:inline-block; min-width:200px;"></span>
    </p>

    <p style="margin-top:10px;">Observa el video <em>“Fracciones”</em> que te mostrará tu profesor(a).</p>
  </div>


  IMPORTANTE: 
  - Los recursos (fichas, anexos, recortables, videos) deben:
    1. Ser mencionados y utilizados en UNA actividad específica del subtema, cada uno en una actividad diferente
    2. Ser creados al final de todas las actividades
  

    ** Ejemplo de Plantilla solo para las fichas
    EJEMPLO DE FICHA:

    IMPORTANTE: cada actividad de las fichas deben empezar con: Actividad 1, Actividad 2, Actividad 3, etc

    <div class="activity-fichas">
      <div class="actividad-principal">
        <p>1. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
      </div>
      <ol>
        <li>Subraya los sustantivos que sean esenciales en cada oración de la lectura.</li>
        <li>Encierra en un rectángulo rojo el sustantivo clave.</li>
        <li>Dibuja en el margen de cada párrafo una imagen que represente la idea completa.</li>
      </ol>
      <span style="color:mediumvioletred;">Respuesta: Los sustantivos son “submarino, periscopio, explorador” y el dibujo debe mostrar un submarino observando con periscopio.</span>
    </div>


    Por lo tanto, **crea actividades que impliquen evaluar relaciones semánticas en el tema del subtema.**  

    ⚠️ RECORDATORIO FINAL:
    ${generarFichasFinal ? `- DEBES incluir la FICHA ${claveFichaActual} con 4 actividades` : ''}
    ${generarAnexosFinal ? '- DEBES incluir el ANEXO VISUAL' : ''}
    ${tieneRecortable ? `- DEBES incluir el RECORTABLE ${claveRecortable}` : ''}
    
    NO OLVIDES: Estos elementos son OBLIGATORIOS si están marcados.
  `;

  return prompt;
}


function generarTablaInicialTodasCategorias() {
  if (!secuenciaActual) return "";

  // ✅ Número de unidad seleccionada
  const unidadSeleccionada = selectUnidad?.value || "1";

  // ✅ Paleta de colores opcional por categoría
  const colorPorCategoria = {
    "Lenguaje y comunicación": "#d9ecff",
    "Ciencias experimentales": "#ffe6cc",
    "Ciencias sociales": "#d4f5d0",
    "Formación socioemocional": "#ffd6e8",
    "Matemáticas": "#e0d6ff",
    "Artes": "#fff3d9",
    "General": "#f0f0f0"
  };

  // ✅ Agrupar subtemas por categoría
  const subtemasPorCategoria = {};
  Object.keys(categoriaPorSubtema).forEach(subtema => {
    const categoria = categoriaPorSubtema[subtema] || "General";
    if (!subtemasPorCategoria[categoria]) subtemasPorCategoria[categoria] = [];
    subtemasPorCategoria[categoria].push(subtema);
  });

  let htmlTabla = `
    <div class="tabla-resumen-unidad" style="margin:20px 0;">
      <table border="1" cellpadding="8" style="width:100%; border-collapse:collapse; font-family:Arial,sans-serif;">
        <thead style="background:#f0f0f0; text-align:left;">
          <tr>
            <th colspan="3">Unidad ${unidadSeleccionada}</th>
          </tr>
        </thead>
        <tbody>
  `;

  // ✅ Recorremos cada categoría agrupada
  Object.entries(subtemasPorCategoria).forEach(([categoria, subtemas]) => {
    const totalFilasCategoria = subtemas.length; // cuántos subtemas tiene esta categoría
    let primeraFila = true;

    subtemas.forEach(subtema => {
      const claveBase = subtema.replace(/\s+/g, "_");
      const tema = secuenciaActual?.[`${claveBase}_T`] || `Tema no definido para ${formatearSubtema(subtema)}`;
      const ae = secuenciaActual?.[`${claveBase}_AE`] || `AE no definido`;

      htmlTabla += `<tr>`;

      // ✅ Primera columna (Categoría) solo en la PRIMERA fila del grupo
      if (primeraFila) {
        const colorFondo = colorPorCategoria[categoria] || "#f7f7f7";
        htmlTabla += `
          <td rowspan="${totalFilasCategoria}" 
              style="background:${colorFondo}; font-weight:bold; text-align:center; vertical-align:middle;">
            ${categoria}
          </td>
        `;
        primeraFila = false;
      }

      // ✅ Segunda columna (Subtema)
      htmlTabla += `
        <td style="background:#fafafa; font-weight:bold; vertical-align:middle;">
          ${formatearSubtema(subtema)}
        </td>
        <td>
          <p style="margin:0; font-weight:bold;">${tema}</p>
          <p style="margin:0; color:#555;">${ae}</p>
        </td>
      `;

      htmlTabla += `</tr>`;
    });
  });

  htmlTabla += `
        </tbody>
      </table>
    </div>
  `;

  return htmlTabla;
}



// ✅ Función robusta con control de rate-limit y errores
async function ejecutarPrompt(mensajes, intentos = 0) {
  await sleep(DELAY_ENTRE_PETICIONES); // respeta el delay entre requests

  const GEMINI_ENDPOINT = getGeminiEndpoint(); // selecciona el endpoint actual
  const url = `${GEMINI_ENDPOINT}?key=${API_KEY}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: mensajes.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      })
    });

    const data = await response.json();

    // 🔄 Si es un 429 (too many requests), espera y reintenta
    if (response.status === 429) {
      console.warn("⏳ Límite de peticiones alcanzado. Esperando 10s antes de reintentar...");
      if (intentos < 5) {
        await sleep(10000);
        return ejecutarPrompt(mensajes, intentos + 1);
      } else {
        throw new Error("❌ Se superó el límite de reintentos (429 Too Many Requests)");
      }
    }

    if (!response.ok) {
      console.error("❌ Error Gemini:", data.error?.message || "desconocido");
      throw new Error(`Error en Gemini: ${response.status}`);
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  } catch (err) {
    console.error("🚨 Error de red:", err);

    if (intentos < 3) {
      console.warn(`Reintentando (${intentos + 1}/3)...`);
      await sleep(5000);
      return ejecutarPrompt(mensajes, intentos + 1);
    } else {
      throw new Error("❌ No se pudo completar la petición a Gemini después de varios intentos");
    }
  }
}

// ✅ Siempre pasa por esta cola para no saturar el modelo
function enviarPrompt(mensajes) {
  colaPrompts = colaPrompts.then(() => ejecutarPrompt(mensajes));
  return colaPrompts;
}


// ✅ Función auxiliar para separar actividades normales y de fichas
function extraerActividades(contenidoActividades) {
  // 1️⃣ Capturar primero TODAS las fichas
  const fichasMatch = [...contenidoActividades.matchAll(
    /<div class="activity-fichas">([\s\S]*?)<\/div>/g
  )].map(m => m[1].trim());

  // 2️⃣ Eliminar las fichas del contenido para evitar confusión
  let contenidoSinFichas = contenidoActividades
    // quitar fichas
    .replace(/<div class="activity-fichas">[\s\S]*?<\/div>/g, "")
    // quitar bloque habilidad cognitiva
    .replace(/<div class="habilidad-cognitiva">[\s\S]*?<\/div>/g, "");

  

  // 3️⃣ Ahora capturar SOLO las actividades normales
  const actividadesMatch = [...contenidoSinFichas.matchAll(
    /<div class="activity">([\s\S]*?)<\/div>/g
  )].map(m => m[1].trim());

  return {
    actividadesNormales: actividadesMatch,
    actividadesFichas: fichasMatch
  };
}


// ✅ Construir notas del maestro con separación correcta de actividades
function construirPromptNotasMaestro(
  contenidoActividades,
  nivel,
  grado,
  subtema,
  tituloCreativo = "",
  tituloVideoGenerado,
  minutosTotales,
  recursosGlobales = {}
) {
  // Extraer claves de recursos del contenido HTML si no se proporcionan
  const extraerClave = (patron) => {
    const match = contenidoActividades.match(patron);
    return match ? match[0] : `(${patron.toString().replace(/\\(.)/g, '$1')} no detectado)`;
  };

  const claveFicha = extraerClave(/Ficha\s+\d+\w*/i) || "(Ficha no detectada)";
  const claveRecortable = extraerClave(/Recortable\s+\d+\w*/i) || "(Recortable no detectado)";
  const claveAnexo = extraerClave(/Anexo\s+\d+\w*/i) || "(Anexo no detectado)";
  const tituloVideo = extraerClave(/video\s+"([^"]+)"/i) || "(Video no detectado)";

  const categoria = categoriaPorSubtema[subtema] || "General";
  const tituloFinal = tituloCreativo || formatearSubtema(subtema);

  const { actividadesNormales, actividadesFichas } = extraerActividades(contenidoActividades);
  
  console.log("✅ Actividades normales detectadas:", actividadesNormales.length);
  console.log("✅ Actividades de fichas detectadas:", actividadesFichas.length);

  if (actividadesNormales.length === 0 && actividadesFichas.length === 0) {
    return "<p>❌ No se detectaron actividades para generar notas del maestro.</p>";
  }

  // ✅ detectar recurso ahora usa SIEMPRE las variables recibidas
  function detectarRecurso(textoPlano, tipo = "normal") {
    if (/ficha\s*\d+/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Esta ficha complementa la actividad principal; úsala como refuerzo después de que los alumnos hayan trabajado el tema."
        : `Usa la ${claveFichaActualGlobal} (actividad de refuerzo) durante esta actividad.`;
    }
    if (/recortable\s*\d+/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Entrega el recortable para que los alumnos lo manipulen y refuercen visualmente el aprendizaje (actividad de ampliación)."
        : `Utiliza el ${claveRecortable} como material de apoyo para ampliar el conocimiento.`;
    }
    if (/anexo\s*/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Muestra el anexo visual como apoyo complementario para facilitar la explicación del tema (actividad de ampliación)."
        : `Muestra el ${claveAnexo} para facilitar la explicación y ampliar el conocimiento.`;
    }
    if (/video/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Proyecta el video antes de la discusión grupal para contextualizar el tema y generar interés (actividad de ampliación)."
        : `Proyecta el video "${tituloVideoGenerado}" antes de comenzar para ampliar el contexto.`;
    }
    return "Actividad general del libro del alumno.";
  }


  // ✅ Procesar actividades normales
  const listaNormales = actividadesNormales.map((a, i) => {
    const textoPlano = a.replace(/<[^>]*>/g, "").trim();
    
    // Extraer recursos específicos
    const fichaMatch = textoPlano.match(/ficha\s+(\d+\w*)/i);
    const videoMatch = textoPlano.match(/video\s+"([^"]+)"/i);
    const recortableMatch = textoPlano.match(/recortable\s+(\d+\w*)/i);
    const anexoMatch = textoPlano.match(/anexo\s+(\d+\w*)/i);

    const modalidad = textoPlano.includes("[IC T. IND]") ? "Trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "Trabajo en parejas"
      : textoPlano.includes("[IC T. EQUI]") ? "Trabajo en equipo"
      : "Sin modalidad";

    // Construir texto de recursos
    let recursosTexto = "";
    if (fichaMatch) recursosTexto += `\nRecurso: Usar la ${fichaMatch[0]} para reforzar el aprendizaje.`;
    if (videoMatch) recursosTexto += `\nRecurso: Proyectar el video "${videoMatch[1]}" antes de la actividad.`;
    if (recortableMatch) recursosTexto += `\nRecurso: Utilizar el ${recortableMatch[0]} como material manipulativo.`;
    if (anexoMatch) recursosTexto += `\nRecurso: Consultar el ${anexoMatch[0]} como referencia visual.`;

    const tituloCorto = textoPlano.split(".")[0];

    return `[ACTIVIDAD ${i + 1}]
      Título: ${tituloCorto}.
      Modalidad: ${modalidad}
      ${recursosTexto}`;
  }).join("\n\n");


  // ✅ Procesar fichas
  const listaFichas = actividadesFichas.map((a, i) => {
    const textoPlano = a.replace(/<[^>]*>/g, "").trim();
    const modalidad = textoPlano.includes("[IC T. IND]") ? "Trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "Trabajo en parejas"
      : textoPlano.includes("[IC T. EQUI]") ? "Trabajo en equipo"
      : "Sin modalidad";

    const recursoExtra = detectarRecurso(textoPlano, "ficha");

    return `
      <div style="margin-top:10px;">
        <p><strong>Ficha ${claveFichaActualGlobal} - Actividad ${i + 1}:</strong> ${textoPlano}</p>
        <p><em>Modalidad:</em> ${modalidad}</p>
        <p><em>Recomendación para el maestro:</em> Úsala como refuerzo o ampliación en la segunda mitad de la semana. ${recursoExtra}</p>
      </div>
    `;
  }).join("\n");


  // ✅ Combinar lista final
  let listaActividadesFinal = listaNormales;
  if (actividadesFichas.length > 0) {
    listaActividadesFinal += `

    --- FICHAS DETECTADAS ---
    ${listaFichas}`;
  }

  const totalActividades = actividadesNormales.length + actividadesFichas.length;

  // 🧠 Calcular tiempos estimados según dificultad
  const evaluarDificultad = txt =>
    /analiza|diseña|justifica|evalúa|construye|propón|compara|argumenta|sintetiza/i.test(txt) ? 10 :
    /explica|relaciona|ordena|interpreta|responde|elige|clasifica/i.test(txt) ? 8 : 5;

  let totalMinutosUnidad = 0;
  let bloquesPorSubtema = {};

  [...actividadesNormales, ...actividadesFichas].forEach((act, index) => {
    const texto = act.replace(/<[^>]*>/g, "").trim();

    const modalidadTrabajo =
      texto.includes("[IC T. IND]") ? "trabajo individual" :
      texto.includes("[IC T. PAR]") ? "trabajo en parejas" :
      texto.includes("[IC T. EQUI]") ? "trabajo en equipo" :
      "sin modalidad definida";

    const esFicha = texto.includes('activity-fichas') || /ficha\s*\d+/i.test(texto);
    const tipoOrigen = esFicha ? "Ficha" : "Libro del alumno";

    const nombreSubtema = formatearSubtema(subtema);
    if (!bloquesPorSubtema[nombreSubtema]) bloquesPorSubtema[nombreSubtema] = [];

    const tiempo = evaluarDificultad(texto);
    totalMinutosUnidad += tiempo;

    bloquesPorSubtema[nombreSubtema].push({
      num: index + 1,
      minutos: tiempo,
      texto,
      modalidad: modalidadTrabajo,
      origen: tipoOrigen
    });
  });

  // ✅ Semana actual
  const numeroUnidad = parseInt(selectUnidad?.value || "1", 10);
  const textoSemana = `Semana ${numeroUnidad}`;

  // ✅ Construir tabla de candelarización (con ORIGEN)
  let filasTablaCompacta = "";
  Object.entries(bloquesPorSubtema).forEach(([subtemaNombre, acts]) => {
    acts.forEach(a => {
      filasTablaCompacta += `
        <tr>
          <td style="border:1px solid #ccc;padding:2px 4px;">${textoSemana}</td>
          <td style="border:1px solid #ccc;padding:2px 4px;">${subtemaNombre}</td>
          <td style="border:1px solid #ccc;padding:2px 4px;">Actividad ${a.num}</td>
          <td style="border:1px solid #ccc;padding:2px 4px;">${a.minutos} min</td>
          <td style="border:1px solid #ccc;padding:2px 4px;">${a.origen}</td>
        </tr>
      `;
    });
  });

  const tablaCandelarizacion = `
    <h4 style="margin-top:10px;">Candelarización de actividades recomendada</h4>
    <p>Este tema se cubre en 1 semana.</p>
    <table style="border-collapse:collapse;font-size:11px;width:auto;min-width:300px;margin-top:5px;">
      <thead>
        <tr style="background:#f9f9f9;">
          <th style="border:1px solid #ccc;padding:2px 4px;">Semana</th>
          <th style="border:1px solid #ccc;padding:2px 4px;">Subtema</th>
          <th style="border:1px solid #ccc;padding:2px 4px;">Actividad</th>
          <th style="border:1px solid #ccc;padding:2px 4px;">Tiempo</th>
          <th style="border:1px solid #ccc;padding:2px 4px;">Origen</th>
        </tr>
      </thead>
      <tbody>${filasTablaCompacta}</tbody>
    </table>
  `;

  // ✅ Notas de fichas (solo si existen)
  let bloqueNotasFicha = "";
  if (actividadesFichas.length > 0) {
    const unidadActual = selectUnidad?.value || "1";
    const claveFicha = claveFichaActualGlobal;

    bloqueNotasFicha += `
      <h1 style="margin-top:15px; color:#004080;">${claveFicha}</h1>
      <p>Notas para el maestro correspondientes a esta ficha de refuerzo:</p>
    `;

   actividadesFichas.forEach((actividad, idx) => {
    const textoPlano = actividad.replace(/<[^>]*>/g, "").trim();
    
    // Extraer recursos específicos
    const videoMatch = textoPlano.match(/video\s+"([^"]+)"/i);
    const recortableMatch = textoPlano.match(/recortable\s+(\d+\w*)/i);
    const anexoMatch = textoPlano.match(/anexo\s+(\d+\w*)/i);
    const fichaMatch = textoPlano.match(/ficha\s+(\d+\w*)/i) || [claveFichaActualGlobal];

    const modalidad = actividad.includes("[IC T. IND]") ? "Trabajo individual"
      : actividad.includes("[IC T. PAR]") ? "Trabajo en parejas"
      : actividad.includes("[IC T. EQUI]") ? "Trabajo en equipo"
      : "Sin modalidad";

    // Determinar tipo de actividad y construir texto de recursos
    let tipoActividad = "Refuerzo";
    let recursosTexto = `Usando ${fichaMatch[0]}`;
    
    if (videoMatch) {
      tipoActividad = "Ampliación";
      recursosTexto += ` y el video "${videoMatch[1]}"`;
    }
    if (recortableMatch) {
      tipoActividad = "Ampliación";
      recursosTexto += ` y el ${recortableMatch[0]}`;
    }
    if (anexoMatch) {
      tipoActividad = "Ampliación";
      recursosTexto += ` y el ${anexoMatch[0]}`;
    }

    const textoPropósito = actividad.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 20)
      .join(" ");

    bloqueNotasFicha += `
      <p><strong>Actividad ${idx + 1} [${tipoActividad}]</strong></p>
      <p style="margin-bottom:20px;"><strong>${textoPropósito}</strong> 
      [Explicación para el docente sobre cómo desarrollar esta actividad ${tipoActividad.toLowerCase()}, 
      ${recursosTexto} para el tema "${tituloCreativo}"] 
      ${modalidad === "Trabajo individual" ? 
        "Supervise el trabajo de cada estudiante" : 
        "Facilite la interacción entre compañeros"}</p>
      <p style="margin-bottom:20px;">Estrategia simplificada para estudiantes con barreras de aprendizaje.</p>
    `;
  });

  }

  // ✅ PROMPT FINAL para maestro
  return `
  IMPORTANTE: No repitas ni reformules el texto de las actividades del alumno. SOLO describe estrategias y orientaciones para el maestro.

  <h2 style="margin-top:20px; margin-bottom:20px;">${tituloCreativo}</h2>

  Estas son las actividades detectadas para el subtema (nivel **${nivel}**, grado **${grado}**):

  ${listaNormales}

  📌 **Tu tarea como IA**  
  Genera un conjunto completo de **Notas para el Maestro**, en formato HTML, para cada actividad.  

  ✅ PARA CADA ACTIVIDAD:
    - Comienza mencionando a qué actividad corresponde: "En la actividad X..."
    - Describe cómo guiarla en el aula y materiales sugeridos
    - **Menciona explícitamente los recursos asociados (ficha, anexo, video, recortable)**
    - Ejemplo: "En la actividad 3, utilice la ${claveFichaActualGlobal} para reforzar..."
    - Incluye la modalidad de trabajo naturalmente en el texto
    - Agrega estrategia para estudiantes con barreras de aprendizaje

  📌 **Distribución del tiempo para este subtema:**  
  - Tema: "${tituloCreativo}"  
  - Actividades detectadas: ${totalActividades}  
  - Tiempo total sugerido: ${minutosTotales} minutos  

  📌 **Formato exacto de cada bloque en las Notas para el Maestro:**  

  <h1>${tituloCreativo}</h1>

  <p><strong>Actividad [General / Refuerzo / Ampliación]</strong></p>
  <p style="margin-bottom:20px;">Estrategias de gestión del aula, **incluyendo modalidad** y un ejemplo/reflexión.</p>

  ${bloqueNotasFicha}

  📌 **Reflexión global al final:**  
  Una sola reflexión de cierre para el maestro.

  **Al final de TODAS las notas, agrega obligatoriamente esta tabla HTML sin cambios:**  
  ${tablaCandelarizacion}

  ⚠️ **Restricciones:**  
  - NO copies ni reformules las actividades del alumno.  
  - Máximo 3 párrafos por actividad.  
  - Solo UNA reflexión global al final.  
  - NO elimines la tabla de candelarización.
  `;
}





let respuestaFinal = "";
let agrupados = {};
let categoriasGeneradas = {}; // { "Lenguaje y comunicación": "<bloque HTML generado>" }
let primeraCategoriaConLectura = null;



// Función para guardar en localStorage
function setupSelectChangeListeners() {
  ["unidadNivel", "unidadGrado", "unidadTrimestre", "unidadNumero", "unidadTema", "unidadTemaASC"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        localStorage.setItem(`unidad_${id}`, el.value);
      });
    }
  });
}

// Función para restaurar valores con manejo especial para unidadTema
function restoreSelectValues() {
  ["unidadNivel", "unidadGrado", "unidadTrimestre", "unidadNumero", "unidadTemaASC"].forEach(id => {
    const el = document.getElementById(id);
    const val = localStorage.getItem(`unidad_${id}`);
    if (el && val) {
      el.value = val;
    }
  });

  // Manejo especial para unidadTema con retraso
  const unidadTemaEl = document.getElementById('unidadTema');
  const unidadTemaVal = localStorage.getItem('unidad_unidadTema');
  if (unidadTemaEl && unidadTemaVal) {
    setTimeout(() => {
      unidadTemaEl.value = unidadTemaVal;
    }, 1000);
  }
}

// Función para disparar eventos de cambio
function triggerChangeEvents() {
  const selectNivel = document.getElementById('unidadNivel');
  const selectGrado = document.getElementById('unidadGrado');
  const selectTrimestre = document.getElementById('unidadTrimestre');
  const selectUnidad = document.getElementById('unidadNumero');

  if (selectNivel && selectNivel.value) selectNivel.dispatchEvent(new Event("change"));
  if (selectGrado && selectGrado.value) selectGrado.dispatchEvent(new Event("change"));
  if (selectTrimestre && selectTrimestre.value) selectTrimestre.dispatchEvent(new Event("change"));
  if (selectUnidad && selectUnidad.value) selectUnidad.dispatchEvent(new Event("change"));
}

// Ejecutar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  setupSelectChangeListeners();
  restoreSelectValues();
  triggerChangeEvents();
  
  // Tu código existente para los botones de scroll
  const modalContent = document.querySelector('#modalGenerarUnidad .modal-content');
  
  document.getElementById('scrollTopBtn')?.addEventListener('click', () => {
    modalContent.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('scrollMiddleBtn')?.addEventListener('click', () => {
    modalContent.scrollTo({ top: modalContent.scrollHeight / 2, behavior: 'smooth' });
  });

  document.getElementById('scrollBottomBtn')?.addEventListener('click', () => {
    modalContent.scrollTo({ top: modalContent.scrollHeight, behavior: 'smooth' });
  });
});
  

  


document.getElementById("btnGuardarUnidad")?.addEventListener("click", async () => {
  const nivel = selectNivel.value;
  const grado = selectGrado.value;
  const trimestre = selectTrimestre.value;
  const unidad = selectUnidad.value;
  const lecturaId = selectTema.value || selectTemaASC.value;
  const htmlContenido = respuestaFinal?.trim();

  console.log("Debug guardar unidad:", {
    nivel,
    grado,
    trimestre,
    unidad,
    lecturaId,
    htmlContenidoLength: htmlContenido?.length
  });


  if (!nivel || !grado || !trimestre || !unidad || !lecturaId || !htmlContenido) {
    alert("❌ Faltan datos para guardar la unidad.");
    return;
  }

  try {
    const unidadDoc = {
      nivel,
      grado,
      trimestre,
      unidad,
      lecturaId,
      contenido: htmlContenido,
      timestamp: new Date()
    };

    await addDoc(collection(db, "unidadesGeneradas"), unidadDoc);
    alert("✅ Unidad guardada correctamente en Firestore.");


    // ✅ Reiniciar la página después de guardar
    location.reload();

  } catch (err) {
    console.error("❌ Error al guardar la unidad:", err);
    alert("❌ No se pudo guardar la unidad.");
  }
});




const btnVerUnidades = document.getElementById("btnListaUnidadesGuardadas");
const modalLista = document.getElementById("modalUnidadesGuardadas");
const modalEditar = document.getElementById("modalEditarUnidad");
const contenedorLista = document.getElementById("contenedorUnidadesGuardadas");
const editorUnidad = document.getElementById("editorUnidadContenido");

let unidadEditandoId = null;
let autoSaveTimeout = null;
let unidadCompartirId = null;

btnVerUnidades?.addEventListener("click", async () => {
  modalLista.style.display = "block";
  contenedorLista.innerHTML = `<tr><td colspan="5"><i class="fas fa-spinner fa-spin"></i> Cargando unidades...</td></tr>`;

  try {
    const snap = await getDocs(query(collection(db, "unidadesGeneradas")));

    if (snap.empty) {
      contenedorLista.innerHTML = "<tr><td colspan='5'>No hay unidades guardadas.</td></tr>";
      return;
    }

    contenedorLista.innerHTML = snap.docs.map(doc => {
      const data = doc.data();
      const docId = doc.id;
      const compartido = !!data.sharewith && Object.keys(data.sharewith).length > 0;
    
      // Obtener el primer <h2> del contenido HTML
      let tituloUnidad = data.tituloUnidad || "";

      if (!tituloUnidad) {
        try {
          const parser = new DOMParser();
          const docHTML = parser.parseFromString(data.contenido || "", "text/html");
          const h2 = docHTML.querySelector("h2");
          tituloUnidad = h2 ? h2.textContent.trim() : "Sin título";
        } catch (e) {
          tituloUnidad = "Sin título";
        }
      }

    
      // Formatear fecha de creación y edición
      const fechaCreacion = data.timestamp?.toDate?.().toLocaleString?.() || "N/D";
      const fechaEdicion = data.editadoEn?.toDate?.().toLocaleString?.() || "N/D";
    
      return `
        <tr>
          <td>${data.nivel}</td>
          <td>${data.grado}</td>
          <td>${data.trimestre}</td>
          <td>${data.unidad}</td>
          <td contenteditable="true" class="titulo-editable" data-id="${docId}">
            ${tituloUnidad}
          </td>

          <td>${fechaCreacion}</td>
          <td>${fechaEdicion}</td>
          <td>
            <button class="btn-editar" data-id="${docId}" data-html="${encodeURIComponent(data.contenido)}" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-eliminar" data-id="${docId}" title="Eliminar">
              <i class="fas fa-trash-alt"></i>
            </button>
            <button class="btn-compartir" data-id="${docId}" title="Compartir" style="color:${compartido ? '#28a745' : '#888'};">
              <i class="fas fa-share-alt"></i>
            </button>
            <button class="btn-copiar" data-html="${encodeURIComponent(data.contenido)}" title="Copiar contenido">
              <i class="fas fa-copy" style="color:#007bff;"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
    
    // Reiniciar DataTable
    if ($.fn.DataTable.isDataTable('#tablaUnidades')) {
      $('#tablaUnidades').DataTable().destroy();
    }
    $('#tablaUnidades').DataTable({
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json"
      }
    });

    // Editar
    document.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => {
        const html = decodeURIComponent(btn.dataset.html);
        unidadEditandoId = btn.dataset.id;
        const htmlLimpio = html.replace(/<style[\s\S]*?<\/style>/gi, "");
        editorUnidad.innerHTML = htmlLimpio;
        modalEditar.style.display = "block";
      });
    });

    // Eliminar
    document.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (confirm("¿Seguro que deseas eliminar esta unidad?")) {
          await deleteDoc(doc(db, "unidadesGeneradas", id));
          alert("✅ Unidad eliminada.");
          location.reload();
        }
      });
    });

    document.querySelectorAll(".titulo-editable").forEach(celda => {
    // Variable para controlar cambios
    let tituloOriginal = celda.textContent.trim();
    
    // Guardar al perder foco
    const guardarTitulo = async () => {
      const nuevoTitulo = celda.textContent.trim();
      const docId = celda.dataset.id;

      // Si no hay cambios, no hacemos nada
      if (nuevoTitulo === tituloOriginal || !nuevoTitulo) {
        if (!nuevoTitulo) {
          celda.textContent = tituloOriginal; // Restauramos el original si está vacío
        }
        return;
      }

      try {
        const unidadRef = doc(db, "unidadesGeneradas", docId);
        const unidadSnap = await getDoc(unidadRef);
        
        if (!unidadSnap.exists()) return;

        const unidadData = unidadSnap.data();
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(unidadData.contenido || "", "text/html");
        
        // Actualizar título en el contenido HTML
        const h2 = docHTML.querySelector("h2");
        if (h2) h2.textContent = nuevoTitulo;

        const nuevoContenido = docHTML.body.innerHTML;

        await updateDoc(unidadRef, {
          contenido: nuevoContenido,
          tituloUnidad: nuevoTitulo,   // ✅ Guardamos un campo explícito
          editadoEn: new Date()
        });


        // Actualizar el original y dar feedback visual
        tituloOriginal = nuevoTitulo;
        celda.style.backgroundColor = "#d4edda";
        setTimeout(() => (celda.style.backgroundColor = ""), 800);

        // Actualizar DataTables
        if ($.fn.DataTable.isDataTable('#tablaUnidades')) {
          $('#tablaUnidades').DataTable().draw(false);
        }

      } catch (error) {
        console.error("Error al guardar:", error);
        celda.textContent = tituloOriginal; // Revertir cambios
        celda.style.backgroundColor = "#f8d7da";
        setTimeout(() => (celda.style.backgroundColor = ""), 800);
        alert("Error al guardar. Intente nuevamente.");
      }
    };

    // Eventos
    celda.addEventListener("blur", guardarTitulo);
    
    celda.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        celda.blur();
      }
    });

    celda.addEventListener("paste", e => {
      e.preventDefault();
      const textoPlano = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, textoPlano);
    });
  });

    // Compartir
    document.querySelectorAll(".btn-compartir").forEach(btn => {
      btn.addEventListener("click", async () => {
        const unidadId = btn.dataset.id;
        unidadCompartirId = unidadId;
    
        const modal = document.getElementById("modalCompartirUnidad");
        const lista = document.getElementById("listaUsuariosCompartirUnidad");
    
        modal.style.display = "block";
        lista.innerHTML = "<p><i class='fas fa-spinner fa-spin'></i> Cargando usuarios...</p>";
    
        try {
          const usuariosSnap = await getDocs(collection(db, "users"));
          const unidadDoc = await getDoc(doc(db, "unidadesGeneradas", unidadId));
          const unidadData = unidadDoc.exists() ? unidadDoc.data() : {};
          const usuariosYaCompartidos = unidadData.sharewith || {};
    
          let contenido = "";
          usuariosSnap.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            const nombre = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Usuario sin nombre";
            const checked = usuariosYaCompartidos[userId] ? "checked" : "";
    
            contenido += `
              <div class="usuario-item">
                <input type="checkbox" value="${userId}" ${checked}>
                <span>${nombre}</span>
              </div>
            `;
          });
    
          lista.innerHTML = contenido;
    
          // ✅ IMPORTANTE: Asignar evento justo aquí después de poblar el DOM
          const btnConfirmar = document.getElementById("btnConfirmarCompartir2");
          btnConfirmar.onclick = async () => {
            const seleccionados = Array.from(document.querySelectorAll("#listaUsuariosCompartirUnidad input[type=checkbox]:checked"))
              .map(cb => cb.value);
    
            if (seleccionados.length === 0) {
              alert("⚠️ Debes seleccionar al menos un usuario.");
              return;
            }
    
            const shareWith = {};
            seleccionados.forEach(uid => shareWith[uid] = true);
    
            try {
              await updateDoc(doc(db, "unidadesGeneradas", unidadId), { sharewith: shareWith });
              alert("✅ Unidad compartida.");
              modal.style.display = "none";
    
              // Actualiza el color del ícono en tiempo real
              btn.querySelector("i").style.color = "#28a745";
            } catch (e) {
              console.error("❌ Error al compartir unidad:", e);
              alert("❌ No se pudo compartir la unidad.");
            }
          };
    
        } catch (e) {
          lista.innerHTML = "<p>❌ Error al cargar usuarios.</p>";
          console.error("❌ Error al cargar usuarios:", e);
        }
      });
    });
    
    document.querySelectorAll(".btn-copiar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const html = decodeURIComponent(btn.dataset.html);
    
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;
    
        const selection = window.getSelection();
        const range = document.createRange();
    
        document.body.appendChild(tempDiv);
        range.selectNodeContents(tempDiv);
        selection.removeAllRanges();
        selection.addRange(range);
    
        try {
          const success = document.execCommand("copy");
          selection.removeAllRanges();
          document.body.removeChild(tempDiv);
          alert(success ? "✅ Contenido copiado con formato." : "❌ No se pudo copiar.");
        } catch (err) {
          document.body.removeChild(tempDiv);
          console.error("Error al copiar:", err);
          alert("❌ Error al copiar.");
        }
      });
    });
    

    

  } catch (e) {
    contenedorLista.innerHTML = "<tr><td colspan='5'>❌ Error al cargar unidades guardadas.</td></tr>";
    console.error(e);
  }
});





// Cerrar modales
document.getElementById("cerrarModalUnidades")?.addEventListener("click", () => {
  modalLista.style.display = "none";
});
document.getElementById("cerrarModalEditarUnidad")?.addEventListener("click", () => {
  modalEditar.style.display = "none";
});

// Guardado automático en tiempo real
editorUnidad?.addEventListener("input", () => {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    if (!unidadEditandoId) return;

    const nuevoContenido = editorUnidad.innerHTML;
    updateDoc(doc(db, "unidadesGeneradas", unidadEditandoId), {
      contenido: nuevoContenido,
      editadoEn: new Date()
    }).then(() => {
      console.log("✅ Unidad actualizada automáticamente.");
    }).catch(e => {
      console.error("❌ Error al guardar automáticamente:", e);
    });
  }, 1500); // 1.5 segundos tras dejar de escribir
});


function limpiarHTML(html) {
  let corregido = html.trim();

  const cerrar = (abrir, cerrar) => {
    const abrirCount = (corregido.match(new RegExp(`<${abrir}(\\s|>)`, "gi")) || []).length;
    const cerrarCount = (corregido.match(new RegExp(`</${cerrar}>`, "gi")) || []).length;
    if (abrirCount > cerrarCount) {
      corregido += `</${cerrar}>`.repeat(abrirCount - cerrarCount);
    }
  };

  ["ul", "ol", "li", "table", "tr", "td", "p", "div"].forEach(tag => cerrar(tag, tag));

  return corregido;
}



document.getElementById("btnDescargarWord")?.addEventListener("click", () => {
  const contenedor = document.getElementById("resultadoUnidadGenerada");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  const bloques = contenedor.querySelectorAll(".bloque-subtema");
  let htmlAlumno = "";

  bloques.forEach(bloque => {
    const hijoAlumno = bloque.children[0]; // lado izquierdo
    if (!hijoAlumno) return;

    const temp = document.createElement("div");
    temp.innerHTML = hijoAlumno.outerHTML;

    const tituloSubtema = temp.querySelector("h4")?.outerHTML || "";

    const actividades = Array.from(temp.querySelectorAll("div.activity"))
      .map(div => div.innerHTML)
      .join("<hr>");

    if (actividades.trim()) {
      htmlAlumno += `${tituloSubtema}${actividades}<hr>`;
    }
  });

  if (!htmlAlumno.trim()) {
    alert("❌ No hay contenido del alumno para exportar.");
    return;
  }

  const htmlAlumnoLimpio = limpiarHTML(htmlAlumno);
  window.contenidoUnidadParaExportar = htmlAlumnoLimpio;

  // Recuperar estilos guardados
  const estilosGuardados = localStorage.getItem("estilosExportarWord");
  if (estilosGuardados) {
    const valores = JSON.parse(estilosGuardados);
    Object.entries(valores).forEach(([key, value]) => {
      const input = document.querySelector(`#formEstilos [name="${key}"]`);
      if (input) input.value = value;
    });
  }

  document.getElementById("modalEstilos").style.display = "block";
});


document.getElementById("btnDescargarMaestro")?.addEventListener("click", () => {
  const bloques = document.querySelectorAll(".bloque-subtema");
  let htmlMaestro = "";

  bloques.forEach(bloque => {
    const columnaDerecha = bloque.children[1]; // columna de notas del maestro
    if (columnaDerecha) {
      htmlMaestro += columnaDerecha.outerHTML + "<hr>";
    }
  });

  if (!htmlMaestro.trim()) {
    alert("❌ No hay notas del maestro para exportar.");
    return;
  }

  const htmlMaestroLimpio = limpiarHTML(htmlMaestro);

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${htmlMaestroLimpio}</body>
    </html>
  `;

  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "notas_maestro.docx";
  enlace.click();
});


document.getElementById("formEstilos").addEventListener("submit", (e) => {
  e.preventDefault();

  const valores = Object.fromEntries(new FormData(e.target).entries());
  localStorage.setItem("estilosExportarWord", JSON.stringify(valores));

  const contenedor = document.createElement("div");
  contenedor.innerHTML = window.contenidoUnidadParaExportar;

  const [htmlAlumnoRaw, htmlMaestroRaw] = contenedor.innerHTML.split("<!-- SEPARADOR -->");

  const procesarConEstilos = (html) => {
    const copia = document.createElement("div");
    copia.innerHTML = html;

    if (valores.h2) copia.querySelectorAll("h2").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.h2}';`));
    if (valores.h3) copia.querySelectorAll("h3").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.h3}';`));
    if (valores.p) copia.querySelectorAll("p").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.p}';`));
    if (valores.list) copia.querySelectorAll("ul, ol").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.list}';`));
    if (valores.table) copia.querySelectorAll("table").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.table}';`));
    if (valores.instruccion) copia.querySelectorAll(".instruccion").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.instruccion}';`));
    if (valores.respuesta) copia.querySelectorAll(".respuestaAlumno").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.respuesta}';`));

    const aplicarEstiloCarácter = (selector, estilo) => {
      copia.querySelectorAll(selector).forEach(el => {
        const span = document.createElement("span");
        span.setAttribute("style", `mso-style-name:'${estilo}';`);
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      });
    };

    if (valores.bolditalic) aplicarEstiloCarácter("b i, i b, strong em, em strong", valores.bolditalic);
    if (valores.bold) aplicarEstiloCarácter("b, strong", valores.bold);
    if (valores.italic) aplicarEstiloCarácter("i, em", valores.italic);
    if (valores.underline) aplicarEstiloCarácter("u", valores.underline);
    if (valores.boldunderline) aplicarEstiloCarácter("b u, u b, strong u, u strong", valores.boldunderline);
    if (valores.sup) aplicarEstiloCarácter("sup", valores.sup);
    if (valores.sub) aplicarEstiloCarácter("sub", valores.sub);
    if (valores.highlight) aplicarEstiloCarácter("mark", valores.highlight);
    if (valores.link) aplicarEstiloCarácter("a", valores.link);
    if (valores.neuro) copia.querySelectorAll(".neuroAplicada").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.neuro}';`));
    if (valores.spec) copia.querySelectorAll(".spec").forEach(el => el.setAttribute("style", `mso-style-name:'${valores.spec}';`));

    return limpiarHTML(copia.innerHTML);
  };

  const htmlAlumnoFinal = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head><body>${procesarConEstilos(htmlAlumnoRaw)}</body></html>
  `;
  const htmlMaestroFinal = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head><body>${procesarConEstilos(htmlMaestroRaw)}</body></html>
  `;

  const blobAlumno = window.htmlDocx.asBlob(htmlAlumnoFinal);
  const blobMaestro = window.htmlDocx.asBlob(htmlMaestroFinal);

  const descargar = (blob, nombre) => {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    enlace.click();
  };

  descargar(blobAlumno, "Unidad_Alumno.docx");
  descargar(blobMaestro, "Unidad_Maestro.docx");

  document.getElementById("modalEstilos").style.display = "none";
});

document.getElementById("btnResetEstilos").addEventListener("click", () => {
  localStorage.removeItem("estilosExportarWord");
  document.querySelectorAll("#formEstilos input").forEach(input => input.value = "");
  alert("Estilos restablecidos. Puedes volver a asignarlos.");
});

// ✅ Descarga del contenido del alumno desde el editor
document.getElementById("btnDescargarWordEditor")?.addEventListener("click", () => {
  const contenedor = document.getElementById("editorUnidadContenido");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  // Clonamos el contenido para no afectar el original
  const clon = contenedor.cloneNode(true);
  
  // Eliminamos las columnas de maestro si existen
  const columnasMaestro = clon.querySelectorAll(".col-maestro");
  columnasMaestro.forEach(col => col.remove());

  // Obtenemos solo el contenido del alumno
  const htmlAlumno = clon.innerHTML;

  if (!htmlAlumno.trim()) {
    alert("❌ No hay contenido del alumno para exportar.");
    return;
  }

  // Limpiamos el HTML
  const htmlAlumnoLimpio = limpiarHTML(htmlAlumno);

  // Creamos el documento Word directamente sin pasar por el modal de estilos
  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .activity { margin-bottom: 20px; }
          .activity-fichas { background: #f5f5f5; padding: 10px; margin-bottom: 15px; }
          h1, h2, h3, h4 { color: #2c3e50; }
          table { border-collapse: collapse; width: 100%; margin: 10px 0; }
          table, th, td { border: 1px solid #ddd; }
          th, td { padding: 8px; text-align: left; }
        </style>
      </head>
      <body>${htmlAlumnoLimpio}</body>
    </html>
  `;

  // Usamos la librería html-docx-js para generar el Word
  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "Unidad_Alumno.docx";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
});


// ✅ Descarga del contenido del maestro desde el editor
document.getElementById("btnDescargarMaestroEditor")?.addEventListener("click", () => {
  const contenedor = document.getElementById("editorUnidadContenido");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  // ✅ Tomamos SOLO las columnas de maestro
  const columnasMaestro = contenedor.querySelectorAll(".col-maestro");
  if (!columnasMaestro.length) {
    alert("❌ No hay contenido del maestro (.col-maestro) para exportar.");
    return;
  }

  let htmlMaestro = "";
  columnasMaestro.forEach(col => {
    htmlMaestro += col.outerHTML + "<hr>";
  });

  const htmlMaestroLimpio = limpiarHTML(htmlMaestro);

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${htmlMaestroLimpio}</body>
    </html>
  `;

  // ✅ Generamos el archivo Word
  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "Unidad_Maestro.docx";
  enlace.click();
});





