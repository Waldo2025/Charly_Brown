import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc  } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { metodologiaASC } from './metodologiaASC.js';
import { insertarGeneradorImagenes } from './generarImagenes.js';
import { estacionesPorNivelYMateria } from './metodologiaASC.js';
import VanillaTilt from 'https://cdn.jsdelivr.net/npm/vanilla-tilt@1.7.3/lib/vanilla-tilt.es2015.min.js';
import { InferenceClient } from 'https://cdn.jsdelivr.net/npm/@huggingface/inference@3.7.1/+esm';


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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


// Obtener parámetros de la URL
const params = new URLSearchParams(window.location.search);
let unidadId = params.get('unidadId');
const userId = params.get('userId');

const unidadContenido = document.getElementById('unidad-contenido');


let currentUserId = null;
let lecturaGenerada = '';
let seleccionTema = '';
let imagenBase64 = "";
let imagenFile = null;
let areasMejoraDetectadas = '';
let nivel = "";
let textoImagen = ""; 
let pdfFile = null;
let rubricaHTML = "";
let pdfEnProceso = false;
let materiasSeleccionadas = [];
let archivoTexto = "No se proporcionó imagen o PDF.";
let nivelSeleccionadoGlobal = "";
let gradoSeleccionadoGlobal = "";
let temaSeleccionadoGlobal = "";
let textoAcumuladoGlobal = "";
// Variables globales necesarias
let continuacionEnCurso = false;


const estructuraCompletaPorNivel = `

    ** IMPORTANTE ESTRUCTURA DE COMPTENCIAS PARA PRIMARIA Y ESTACIONES PARA SECUNDARIA:
    *IMPORTANTE: COMPETENCIAS SOLO PARA PRIMARIA BAJA (PRIMERO, SEGUNDO Y TERCERO DE PRIMARIA):
    -  IMPORTANTE Para Lectura: Esta actividad combina lectura literaria con comprensión lectora y vocabulario, mediante la identificación de sinónimos a partir de un cuento narrativo situado en un entorno natural.
    -  IMPORTANTE 1. Convenciones lingüísticas (ortografía): Actividad de revisión ortográfica que promueve la lectura atenta, el dictado para evaluar la memoria visual y la corrección colaborativa de un texto con errores ortográficos, enfocándose en el uso correcto de acentos, mayúsculas y ortografía en general.escritura guiada. 
    -  IMPORTANTE 2. Convenciones lingüísticas (gramática): Esta página trabaja la conciencia fonológica y el reconocimiento visual de palabras, mediante 2 a 3 actividades de ejercicios de rimas, escritura en cursiva y formación de palabras con letras faltantes, fomentando la observación, la escritura y el juego sonoro.
    -  IMPORTANTE 3. Expresión escrita (3 actividades): Esta página se enfoca en el desarrollo de la expresión escrita y la comprensión de estructuras sintácticas mediante tres actividades: (1) ordenar palabras por secuencia lógica o cronológica, (2) identificar y leer oraciones dentro de un texto dado, y (3) reorganizar palabras desordenadas para formar dos o tres oraciones completas y coherentes.
    -  IMPORTANTE 4. Trazos y letras  (3 actividades): Esta página desarrolla la motricidad fina y la escritura cursiva a través de cuatro actividades centradas en la trazabilidad de alguna letra, que incluyen caligrafía con colores, repetición de letras, copia de una oración modelo, y el remarcado de una oración completa tomada del texto.
    -  IMPORTANTE 5. Comprensión lectora  (3 actividades): Esta actividad de comprensión visual propone una actividad, fomentando la observación atenta, el análisis de detalles y la comparación como habilidades lectoras iniciales.
    -  IMPORTANTE 6. Expresión oral  (1 actividades): 2 Actividades de observación científica y expresión oral
    -  IMPORTANTE 7. Educación socioemocional:2 actividades de reflexión socioemocional para identificar fortalezas, dificultades y emociones personales.
    -  IMPORTANTE 8. Conocimiento del medio: 2 a 3 Actividades diversas de conocimiento del medio que promueven la observación, expresión oral, análisis personal y comprensión lectora mediante ejercicios creativos y lúdicos como líneas del tiempo y crucigramas.
    -  IMPORTANTE 9. Formación cívica y ética: 3 actividades de formación cívica y ética enfocada en la expresión corporal y emocional, que promueve el reconocimiento de sensaciones, el trabajo colaborativo y la reflexión personal sobre el cuerpo como medio de comunicación.
    -  IMPORTANTE 10. Habilidades: 2 actividades de habilidades cognitivas centrada en la observación, comparación y categorización de imágenes según color, forma, tamaño o número, fomentando el pensamiento lógico y la atención al detalle.
    -  IMPORTANTE 11. MINDMAP: dejar solo el titulo, esuna plantilla para crear un mindmap desde cero
    -  IMPORTANTE 12. Matemáticas: 10 a 12 Actividades matemáticas centradas en el cálculo mental del doble de cantidades y el uso del material base 10 para representar y comprender valores numéricos, favoreciendo el pensamiento lógico y el aprendizaje visual.

    IMPORTANTE:
    -títulos en h1
    -reinicia la numeración de las actividades en cada Competencia 

    -------------

    * IMPORTANTE: ESTRUCTURA DE COMPETENCIAS SOLO PARA PRIMARIA ALTA (CUARTO, QUINTO Y SEXTO DE PRIMARIA):
    - IMPORTANTE Para Lectura: Esta actividad combina lectura literaria con comprensión lectora y vocabulario, mediante la identificación de sinónimos a partir de un cuento narrativo situado en un entorno natural.
    - IMPORTANTE 1.  Convenciones lingüísticas (Ortografía): 3 actividades de revisión ortográfica que promueve la lectura atenta, el dictado para evaluar la memoria visual y la corrección colaborativa de un texto con errores ortográficos, enfocándose en el uso correcto de acentos, mayúsculas y ortografía en general.
    - IMPORTANTE 2.  Convenciones lingüísticas (Gramática): (3 Actividades gramaticales basada en la lectura generadora, que integra identificación de sustantivos clave, representación visual de ideas, narración oral y análisis de estructura textual.
    - IMPORTANTE 3. Expresión escrita: 5 actividades de escritura que promueve el análisis de materiales audiovisuales mediante la elaboración de una reseña estructurada con elementos informativos, reflexivos y de opinión personal.
    - IMPORTANTE 4. Expresión oral: 1 Actividad de expresión oral que implica la preparación y presentación de un discurso breve basado en una lectura y reseña previa, con énfasis en el uso de un lenguaje claro, estructurado y persuasivo.
    - IMPORTANTE 5. Educación socioemocional: 2 a 3 actividades de autorregulación emocional y atención plena que promueve la reflexión, la práctica consciente de respiración y el intercambio de experiencias para mejorar el enfoque y bienestar personal.

    - IMPORTANTE 6. Ciencias Naturales: 3 a 5 actividades interdisciplinarias que fusiona observación visual, reflexión escrita y discusión grupal para fomentar el análisis crítico y la integración de conceptos.
    - IMPORTANTE 7. Historia: 2 a 3 actividades de Historia que promueve la reflexión sobre procesos de cambio en el tiempo a través de experiencias personales y dinámicas variadas como organización secuencial, expresión oral o actividades lúdicas.
    - IMPORTANTE 8. Geografía: 2 a 3 actividades de Geografía que promueve la observación, comparación y análisis crítico de información espacial o territorial, a partir de distintos recursos visuales o contextuales.
    - IMPORTANTE 9. Formación Cívica y Ética: 2 a 3 actividades que fomenta la autorreflexión, el compromiso personal y el seguimiento de hábitos positivos mediante el análisis de actitudes y el monitoreo del crecimiento individual.
    - IMPORTANTE 10. Habilidades: 2 a 3 Actividades de enriquecimiento del vocabulario que ejercita el pensamiento lógico y lingüístico mediante la identificación de antónimos y la construcción de analogías.
    - IMPORTANTE 11. Dictado: Actividad de enriquecimiento del vocabulario que ejercita el pensamiento lógico y lingüístico mediante la identificación de antónimos y la construcción de analogías, añadir instrucción y dejar 15 lineas en blanco, es un dictado.
    - IMPORTANTE 12. MINDMAP: dejar solo el titulo, plantilla para crear mindmap desde cero
    - IMPORTANTE 13. Matemáticas: (8 a 10 actividades, Actividades variadas de matemáticas que combinan juegos, retos, ejercicios visuales, análisis de resultados, tablas y representaciones gráficas para resolver problemas de manera lúdica y colaborativa.

    IMPORTANTE:
    -títulos en h1
    -reinicia la numeración de las actividades en cada Competencia 
    IMPORTANTE añadir esta nota con estilo dentro de un div con class="alertaIA" en cada Competencia: ⚠️ Es IMPORTANTE: Revisar todo el contenido generado con la IA.

    ------------

    *IMPORTANTE: COMPETENCIAS SOLO PARA PRIMARIA INGLÉS (PRIMERO, SEGUNDO, TERCERO, CUARTO, QUINTO Y SEXTO DE PRIMARIA):

    - IMPORTANTE: Reading (3 a 5 activities)
    - IMPORTANTE: Vocabulary (3 a 5 activities) Actividades centradas en la ampliación, clasificación y uso funcional del vocabulario. Los estudiantes trabajan con listas organizadas de palabras por categorías gramaticales (adjetivos, sustantivos, verbos), practicando su significado, ortografía y aplicación en oraciones. Este tipo de ejercicios fortalece la conciencia léxica y la precisión al escribir, facilitando también la comprensión lectora. Las actividades pueden incluir dictados, completar oraciones, crucigramas, juegos de memoria, clasificación y escritura creativa usando el vocabulario propuesto.
    - IMPORTANTE: Say It Right (3 a 5 activities) Actividades enfocadas en ampliar el vocabulario temático del estudiante mediante la identificación y práctica de sonidos vocálicos en palabras clave. Estas actividades promueven la conciencia fonológica, la discriminación auditiva y la pronunciación precisa del inglés, especialmente a través de la escucha activa y la repetición guiada. El estudiante asocia sonidos con patrones ortográficos y mejora su capacidad de decodificación y fluidez al leer en voz alta. Ideal para ejercicios de tipo “Listen and repeat”, emparejamiento de sonidos con palabras, y organización de vocabulario según fonemas vocálicos.
    -  IMPORTANTE: Mind Map (3 a 5 activities) Mindmap de la Lecura (No Generar contenido, solamente el título)
    -  IMPORTANTE: Reading Comprehension (3 a 5 activities) Actividad 1, conjunto de 4 preguntas abiertas que ayudan a los alumnos a repasar el texto leído. Las preguntas son directas y enfocadas en la comprensión,  Actividad 2:
    -  IMPORTANTE: Vocabulary and Spelling (3 a 5 activities) Una sección de 4 Actividades de adivinanzas de vocabulario o similar con descripciones en inglés sobre tres animales, cosas, personas, etc. Los estudiantes deben leer la pista y adivinar de qué se trata, escribiendo su respuesta en la línea siguiente.
    -  IMPORTANTE: Write It Right (3 a 5 activities) Dejar solo líneas para Que el Docente pueda realizar un Dictado al alumno
    -  IMPORTANTE: Language Arts (3 a 5 activities) Actividades de práctica gramatical para Primaria en inglés, que combinan ejemplos guiados, ejercicios de opción múltiple, comparación de estructuras afirmativas, negativas e interrogativas, y espacios para completar con reglas gramaticales básicas del presente simple.
    -  IMPORTANTE: Grammar (3 a 5 activities) Ejercicios de gramática contextualizada que combinan completar oraciones con el verbo adecuado, formular preguntas y negaciones en presente simple, identificar sustantivos y adjetivos en un texto, y redactar oraciones propias a partir de ellos.
    -  IMPORTANTE: Let's play (3 a 5 activities) Juego de mesa colaborativo que refuerza la comprensión oral o lectora mediante preguntas y respuestas tipo trivia, con instrucciones paso a paso para trabajar en parejas.
    -  IMPORTANTE: Fun, fun, fun (3 a 5 activities) Proyecto creativo tipo "maker" que combina modelado con plastilina, escritura guiada y juego simbólico para construir y presentar un mini zoológico interactivo.
    -  IMPORTANTE: Sing Along (3 a 5 activities) Hoja pautada para copiar, escribir o completar una canción, ideal para ejercicios de escucha activa o producción escrita musical (Sing Along).
    -  IMPORTANTE: Listening Comprehension (3 a 5 activities) Ejercicio de comprensión auditiva con apoyo visual, donde los estudiantes relacionan animales con acciones y completan con una respuesta escrita basada en la escucha (Listening Comprehension).
    -  IMPORTANTE: Reading 2 (3 a 5 activities) Genera una lectura breve y llamativa, acompañada de un audio narrado, y crea un mindmap visual con las ideas clave de la lectura.
    -  IMPORTANTE: Let's Draw It (3 a 5 activities) plantilla para crear el mindmap de Reading 2
    -  IMPORTANTE: Grammar Review (3 a 5 activities) Ejercicios de revisión gramatical que incluyen actividades para ordenar palabras y construir oraciones completas, identificar tipos de oración (afirmativa, negativa, interrogativa) y completar espacios en blanco con la opción gramatical adecuada, seguidos de un anexo complementario que propone actividades interactivas de repaso general a través de juegos de tarjetas, audio y autoevaluación.
    -  IMPORTANTE: Real Case (3 a 5 activities) Lectura breve basada en un caso real acompañada de preguntas de reflexión personal y discusión oral, con el objetivo de desarrollar habilidades de comprensión, pensamiento crítico y expresión oral en inglés.
    -  IMPORTANTE: I Can Write (3 a 5 activities) Ejercicio de escritura libre basada en una lectura previa, que invita a redactar al menos cinco oraciones descriptivas usando estructuras simples en presente, con apoyo visual relacionado al tema de la lectura (como animales u otros elementos del entorno).
    -  IMPORTANTE: English at the Playground (3 a 5 activities) Esta actividad lúdica fomenta el uso oral de estructuras gramaticales básicas a través de un juego activo en equipo, donde los estudiantes deben formar oraciones utilizando verbos auxiliares y principales en presente mientras se mueven físicamente, promoviendo el aprendizaje kinestésico del idioma.
    - IMPORTANTE: Math Point (3 a 5 activities) Estas actividades desarrollan el pensamiento lógico-matemático mediante juegos de combinaciones numéricas y organización secuencial, en donde los estudiantes deben identificar patrones, formar números y ordenarlos en forma ascendente y descendente de manera visual y dinámica.
    -  IMPORTANTE: Now I Know! (3 a 5 activities) Diseña una unidad educativa de inglés para primaria basada en una lectura corta que incluya actividades integradas de Reading Skills, Writing Skills, Listening Skills y Speaking Skills, con ejercicios variados como completar oraciones, ordenar palabras, comprender textos, escuchar audios, asociar imágenes y evaluar pronunciación y fluidez.


    ------------


    IMPORTANTE: ESTRUCTURA DE LAS ESTACIONES O COMPETENCIAS PARA SECUNDARIA TODOS LOS GRADOS
    -   IMPORTANTE: Objetivos (lista de objetivos a seguir   en el todo el  Tema)
    -  IMPORTANTE: Conocimientos Previos  (lista de conocimientos previos para poder desarrollar la actividad)
    -  IMPORTANTE: Lectura (eextención de  600  palabras para Primero de Secundaria, 800 palabras para Segundo de Secundaria y 1000 palabras para Tercero de Secundaria) dificultad de comprension lectora Alta:
    -  IMPORTANTE: - Preguntas de comprensión: 5 Preguntas sobre comprensión de la lectura
    -   IMPORTANTE: Título -1ra Estación
    IMPORTANTE:  - Actividades: de 5 a 10 Ejercicios sobre
    IMPORTANTE:  - Preguntas Clave: 2 Preguntas que amplien el conocimiento sobre el tema
    IMPORTANTE:  - Actividades de refuerzo: 2 ejercicios para reforzar el tema
    IMPORTANTE:  - Actividades de ampliación: 1 Actividad que ayude a  ampliar locs conocimientos sobre el tem
    IMPORTANTE:  - Autoevaluación: encuesta de 4 preguntas de autoevaluación que el estudiante deberá responder por si mismo sobre la comprensión del tema, no se califican
    IMPORTANTE: - Evidencias: encuesta de preguntas para el estudiante, no se califican
    - IMPORTANTE: Título  -2da Estación   
    IMPORTANTE:  - Actividades: de 5 a 10 Ejercicios sobre
    IMPORTANTE:  - Preguntas Clave: 2 Preguntas que amplien el conocimiento sobre el tema
    IMPORTANTE:  - Actividades de refuerzo: 2 ejercicios para reforzar el tema
    IMPORTANTE:  - Actividades de ampliación: 1 Actividad que ayude a  ampliar locs conocimientos sobre el tem
    IMPORTANTE:  - Autoevaluación: encuesta de 4 preguntas de autoevaluación que el estudiante deberá responder por si mismo sobre la comprensión del tema, no se califican
    IMPORTANTE: - Evidencias: encuesta de preguntas para el estudiante, no se califican
    - IMPORTANTE: Título  -3ra Estación
    IMPORTANTE:  - Actividades: de 5 a 10 Ejercicios sobre
    IMPORTANTE:  - Preguntas Clave: 2 Preguntas que amplien el conocimiento sobre el tema
    IMPORTANTE:  - Actividades de refuerzo: 2 ejercicios para reforzar el tema
    IMPORTANTE:  - Actividades de ampliación: 1 Actividad que ayude a  ampliar locs conocimientos sobre el tem
    IMPORTANTE:  - Autoevaluación: encuesta de 4 preguntas de autoevaluación que el estudiante deberá responder por si mismo sobre la comprensión del tema, no se califican
    IMPORTANTE: - Evidencias: encuesta de preguntas para el estudiante, no se califican
    - IMPORTANTE: Título  -4ta Estación
    IMPORTANTE:  - Actividades: de 5 a 10 Ejercicios sobre
    IMPORTANTE:  - Preguntas Clave: 2 Preguntas que amplien el conocimiento sobre el tema
    IMPORTANTE:  - Actividades de refuerzo: 2 ejercicios para reforzar el tema
    IMPORTANTE:  - Actividades de ampliación: 1 Actividad que ayude a  ampliar locs conocimientos sobre el tem
    IMPORTANTE:  - Autoevaluación: encuesta de 4 preguntas de autoevaluación que el estudiante deberá responder por si mismo sobre la comprensión del tema, no se califican
    IMPORTANTE: - Evidencias: encuesta de preguntas para el estudiante, no se califican
    - IMPORTANTE: Título -Fuentes Bibliográficas
    Importante: agregar todas las fuentes bibliográficas usadas en todas las actividades, indicar claramente que fuente pertence a cada qué actividad.


    * IMPORTANTE: Nombres de las Estaciones Para Historia del Mundo, Historia de México 1, Historia de México 2 (Primero, Segundo y Tercero de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Comprensión del tiempo y del espacio históricos
    IMPORTANTE: 2da Estación: Manejo de información histórica
    IMPORTANTE: 3ra Estación: Conciencia histórica
    IMPORTANTE: 4ta Estación: Cultura histórica

    * IMPORTANTE: Nombres de las Estaciones Para Biología (Primero de Secundaria): formato h2

    IMPORTANTE: 1ra Estación: Conceptos científicos
    IMPORTANTE: 2da Estación: Pensamiento científico
    IMPORTANTE: 3ra Estación: Experimentación
    IMPORTANTE: 4ta Estación: Interdisciplinariedad

    * IMPORTANTE: Nombres de las Estaciones Para Matemáticas 1, Matemáticas 2 y Matemáticas 3 (Primero, Segundo y Tercero de Secundaria): formato h2

    IMPORTANTE: 1ra Estación: Conceptos matemáticos
    IMPORTANTE: 2da Estación: Retos matemáticos
    IMPORTANTE: 3ra Estación: Lógica matemática
    IMPORTANTE: 4ta Estación: Matematización

    * IMPORTANTE: Nombres de las Estaciones Para Español 1, Español 2 y Español 3 (Primero, Segundo y Tercero de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Comprensión lectora
    IMPORTANTE: 2da Estación: Convenciones linguísticas
    IMPORTANTE: 3ra Estación: Expresión escrita
    IMPORTANTE: 4ta Estación: Expresión oral

    * IMPORTANTE: Nombres de las Estaciones Para Formación Civica y Ética 1, Formación Civica y Ética 2 y Formación Civica y Ética 3 (Primero, Segundo y Tercero de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Reconocimiento y manejo de información cívica y ética
    IMPORTANTE: 2da Estación: Perspectivas a través del tiempo
    IMPORTANTE: 3ra Estación: Reflexión y valoración de la diversidad en el mundo
    IMPORTANTE: 4ta Estación: Participación en mi comunidad

    * IMPORTANTE: Nombres de las Estaciones Para Geografía (Primero de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Manejo de información geográfica
    IMPORTANTE: 2da Estación: Valoración de la diversidad natural, social y cultural
    IMPORTANTE: 3ra Estación: Reflexión de las diferencias socioeconómicas
    IMPORTANTE: 4ta Estación: Participación en el espacio donde se vive

    * IMPORTANTE: Nombres de las Estaciones Para Física (Segundo de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Conceptos científicos
    IMPORTANTE: 2da Estación: Pensamiento científico
    IMPORTANTE: 3ra Estación: Experimentación
    IMPORTANTE: 4ta Estación: Interdisciplinariedad

    * IMPORTANTE: Nombres de las Estaciones Para Química (Tercero de Secundaria): formato h2
    IMPORTANTE: 1ra Estación: Conceptos científicos
    IMPORTANTE: 2da Estación: Pensamiento científico
    IMPORTANTE: 3ra Estación: Experimentación
    IMPORTANTE: 4ta Estación: Interdisciplinariedad

    `;


onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        
        // Obtener el rol del usuario desde Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();

            // Verificar si el rol es 'admin'
            if (userData.role === "admin") {
                // Mostrar la sección de "Gestionar Usuarios" para el admin
                document.getElementById('gestionUsuariosLink').style.display = 'block';
            } else {
                // Si no es admin, ocultar la sección
                document.getElementById('gestionUsuariosLink').style.display = 'none';
            }
        }

        // Obtener parámetros de la URL
        const params = new URLSearchParams(window.location.search);
        unidadId = params.get('unidadId'); // Ahora funciona porque unidadId es let
        
        if (!unidadId) {
            unidadContenido.innerHTML = "<p>No se ha especificado una unidad.</p>";
            return;
        }
        
        // Cargar unidad y luego lecturas
        await cargarUnidad(currentUserId);
        await cargarLecturas();
    } else {
        unidadContenido.innerHTML = "<p>Debes iniciar sesión para ver esta unidad.</p>";
        window.location.href = "login.html";
    }
});



const googleAPIKey = "AIzaSyA-Al10Diw6CkowW0F3EePEBD6D1h3jwxw";
const googleAPIEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";


const cargarUnidad = async (userId) => {
    try {
    if (!unidadId) {
        unidadContenido.innerHTML = "<p>Faltan datos para cargar la unidad.</p>";
        return;
    }

    const docRef = doc(db, "Unidades", unidadId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.userId !== userId) {
        unidadContenido.innerHTML = "<p>No tienes permiso para ver esta unidad.</p>";
        return;
        }
        
        nivel = data.nivel;

        // Mostrar campos editables
        unidadContenido.innerHTML = `
        <h2 contenteditable="true" id="tituloUnidad">${data.nivel} - ${data.grado} - Unidad ${data.unidad}</h2>

        <label><strong>Trimestre:</strong>
            <input type="number" id="trimestreInput" value="${data.trimestre}" min="1" max="3" />
        </label>

        <label><strong>Privacidad:</strong>
            <select id="privacidadSelect">
            <option value="Privado" ${data.privacidad === 'Privado' ? 'selected' : ''}>Privado</option>
            <option value="Público" ${data.privacidad === 'Público' ? 'selected' : ''}>Público</option>
            </select>
        </label>

        <p><strong>Creado el:</strong> ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "Desconocido"}</p>
        `;

        // Eventos para guardar automáticamente
        document.getElementById("trimestreInput").addEventListener("change", async (e) => {
        await updateDoc(docRef, { trimestre: parseInt(e.target.value) });
        });

        document.getElementById("privacidadSelect").addEventListener("change", async (e) => {
        await updateDoc(docRef, { privacidad: e.target.value });
        });

        document.getElementById("tituloUnidad").addEventListener("blur", async (e) => {
        const texto = e.target.textContent;
        const match = texto.match(/^(.*) - (.*) - Unidad (.*)$/i);
        if (match) {
            const nivel = match[1];
            const grado = match[2];
            const unidad = match[3];
            await updateDoc(docRef, { nivel, grado, unidad });
        }
        });

    } else {
        unidadContenido.innerHTML = "<p>La unidad no fue encontrada.</p>";
    }

    } catch (error) {
    console.error("Error al cargar la unidad:", error);
    unidadContenido.innerHTML = "<p>Ocurrió un error al cargar la unidad.</p>";
    }
};

document.addEventListener("DOMContentLoaded", cargarUnidad);



const dropArea = document.getElementById("drop-area");
const fileInput = document.getElementById("imagenRubrica");

// Habilitar clic para seleccionar imagen o PDF
dropArea.addEventListener("click", () => fileInput.click());


// Soporte drag & drop
["dragenter", "dragover", "dragleave", "drop"].forEach(event => {
    dropArea.addEventListener(event, e => {
        e.preventDefault();
        e.stopPropagation();
    });
});// Imagen o PDF soltado
dropArea.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (file) {
    if (file.type.startsWith("image/")) {
        procesarImagen(file);
    } else if (file.type === "application/pdf") {
        procesarPDF(file);
    } else {
        alert("Por favor sube una imagen o un archivo PDF.");
    }
    }
});

// Imagen seleccionada con el input
fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) {
    if (file.type.startsWith("image/")) {
        procesarImagen(file);
    } else if (file.type === "application/pdf") {
        procesarPDF(file);
    } else {
        alert("Por favor sube una imagen o un archivo PDF.");
    }
    }
});

// Procesar imagen
function procesarImagen(file) {
    imagenFile = file;
    const reader = new FileReader();
    reader.onload = () => {
    imagenBase64 = reader.result.split(",")[1]; // ⚠️ Asegura que esto quede asignado
    dropArea.innerHTML = `<p>✅ Imagen cargada: ${file.name}</p>`;
    };
    reader.readAsDataURL(file);
}

// Procesar PDF
function procesarPDF(file) {
    pdfFile = file;
    pdfEnProceso = true;

    const reader = new FileReader();
    reader.onload = async () => {

        const pdfData = new Uint8Array(reader.result);
        
        try {
            // Asegúrate de especificar la ruta del worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
        
            const pdf = await pdfjsLib.getDocument(pdfData).promise;
            let pdfText = "";
            
            // Extraer texto de cada página
            for (let i = 0; i < pdf.numPages; i++) {
                const page = await pdf.getPage(i + 1);
                const textContent = await page.getTextContent();
                textContent.items.forEach(item => {
                    pdfText += item.str + " ";
                });
            }
            
            if (pdfText.trim() === "") {
                pdfText = "No se pudo extraer texto del PDF.";
            }
    
            // Asignamos el texto extraído del PDF a la variable correspondiente
            textoImagen = pdfText.trim(); // Guardamos el texto extraído

            dropArea.innerHTML = `<p>✅ PDF cargado. Esperando análisis...</p>`;

            pdfEnProceso = false; 

        } catch (error) {
            console.error("Error al procesar el PDF:", error);
            dropArea.innerHTML = `<p>Error al procesar el archivo PDF.</p>`;
        }

        
    };
    reader.readAsArrayBuffer(file);
}
    
    

document.getElementById("analizarBtn").addEventListener("click", async () => {
    const textoOriginal = document.getElementById("lecturaOriginal").innerHTML.trim();
    const temarioTexto = document.getElementById("temarioTexto").innerText.trim();

    if (!textoOriginal || !temarioTexto) {
        alert("Debes ingresar la lectura original y el temario.");
        return;
    }

    const analizarBtn = document.getElementById("analizarBtn");
    analizarBtn.disabled = true;
    analizarBtn.innerHTML = '<i class="bx bx-loader bx-spin"></i> Analizando...';

    try {
        let archivoTexto = "No se proporcionó imagen o PDF.";
        if (imagenFile) archivoTexto = "Imagen cargada. Se analizará sin extraer texto.";
        if (pdfFile) archivoTexto = "PDF cargado. Se analizará sin extraer texto.";

        if (pdfEnProceso) {
            alert("El archivo PDF aún se está cargando. Espera unos segundos e intenta de nuevo.");
            return;
        }

        rubricaHTML = document.getElementById("rubricaTexto").innerHTML.trim();

        const nivelSeleccionado = document.getElementById("nivelSelect").value;
        const gradoSeleccionado = document.getElementById("gradoSelect").value;
        const generoSeleccionado = document.getElementById("generoSelect").value;
        const incluirFichas = document.getElementById("checkFichas").checked;
        const incluirAnexos = document.getElementById("checkAnexos").checked;
        const incluirRecortables = document.getElementById("checkRecortables").checked;
        const temaEspecifico = document.getElementById("temaInput2").value.trim();

        const prompt = `
        Eres un editor pedagógico profesional en México, haciendo libros para Preescolar, Primaria y Secundaria. 
        vas a generar un Análisis breve pero estructurado y limpio sobre ésta lectura ${textoOriginal} en HTML sobre el tema "${temaEspecifico}", tomando en cuenta el programa de la la NEM (más actual).
        📚 Datos de entrada para analizar:
        - Lectura original: ${textoOriginal}
        - Temario relacionado: ${temarioTexto}
        - Rúbrica pedagógica: ${rubricaHTML || 'No se proporcionó rúbrica textual, sólo imagen.'}
        - Contenido de imagen o PDF: ${archivoTexto}

    
       
        IMPORTANTE: No agregar comentarios extras de la inteligencia artificial, solo devuelve lo solicitado.
        IMPOTANTE: ⚠️ No usar emojis, usar iconos fontawsome, no comentarios IA, no listas anidadas, saltos de sección claros.


       
        📄 FORMATO HTML ESPERADO:
        IMPORTANTE incluir:
            📌 TEMA PRINCIPAL
            🔍 ÁREAS DE MEJORA
            📋 HABILIDADES EVALUADAS
            📋 NUEVA SECUENCIA Y ALCANCE A PARTIR DEL DOCUMENTO
        `;

        const body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2000
            }
        };

        const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Error en la API: ${response.status}`);
        }

        const data = await response.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!rawText) {
            throw new Error("La respuesta de la API no contiene texto válido");
        }

        console.log("Texto bruto generado:", rawText);

        // Eliminar etiquetas de markdown ```html ``` si vienen
        if (/^```(?:html)?/i.test(rawText)) {
            rawText = rawText.replace(/```(?:html)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
            console.log("Se eliminó bloque markdown ``` de la respuesta.");
        }

        // Si viene HTML completo
        if (rawText.startsWith("<!DOCTYPE html") || rawText.startsWith("<html")) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawText, "text/html");
            const bodyContent = doc.body?.innerHTML?.trim();
            if (bodyContent) {
                rawText = bodyContent;
                console.log("Se extrajo contenido del <body>.");
            }
        }

        // Guardar el texto inicial
        textoAcumuladoGlobal = rawText;

        // 🔁 Si está cortado, continuar generando
        if (esRespuestaCortadaPorTokens(textoAcumuladoGlobal)) {
            console.warn("⚠️ La respuesta parece cortada. Continuando automáticamente...");
            await forzarContinuacionAutomatica(textoAcumuladoGlobal);
        }

        // ✅ Ahora sí, ya con lectura COMPLETA, procesar
        console.log("✅ Análisis completo generado:");
        localStorage.removeItem("formularioLectura");
        procesarRespuestaGemini(textoAcumuladoGlobal);
        guardarFormularioEnLocalStorage();

    } catch (error) {
        console.error("Error en el análisis:", error);
        mostrarError(`Error al analizar: ${error.message}`);
    } finally {
        analizarBtn.disabled = false;
        analizarBtn.textContent = "Analizar lectura e imagen";
    }
});
    
    function esRespuestaCortadaPorTokens(texto) {
        // Detecta si la respuesta se cortó por tokens de forma común (sin cerrar etiquetas, etc.)
        const patronesCorte = [
            /<\/[a-z]+>\s*$/,        // termina justo cerrando una etiqueta
            /[a-z]{2,}\s?$/i,        // termina con una palabra incompleta
            /(\.{3,}|[—–-]$)/,       // termina con puntos suspensivos o guiones
            /<\/ol>\s*$/,            // termina la lista pero falta contenido después
        ];
        const umbralMinimo = 1000; // No continuar si es muy corta

        return texto.length > umbralMinimo && patronesCorte.some(pat => pat.test(texto));
    }

    function formatearTextoConHTML(texto) {
        // Convertir Markdown básico a HTML
        let html = texto
            // Títulos
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            
            // Negritas e itálicas
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            
            // Listas
            .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            
            // Párrafos (asegurar que los saltos de línea se conviertan en párrafos)
            .replace(/^(?!<[a-z])(.*$)/gm, '<p>$1</p>')
            .replace(/<p><\/p>/g, '')
            
            // Tablas básicas
            .replace(/\|(.*)\|/g, function(match) {
                return '<table><tr>' + match.split('|').slice(1, -1).map(cell => 
                    `<td>${cell.trim()}</td>`).join('') + '</tr></table>';
            });
        
        // Agrupar elementos de lista
        html = html.replace(/<li>.*?<\/li>(?:\n<li>.*?<\/li>)*/g, function(match) {
            const items = match.split('\n').filter(item => item.trim() !== '');
            const listType = items[0].includes('<li>1.') ? 'ol' : 'ul';
            return `<${listType}>${items.join('')}</${listType}>`;
        });
        
        return html;
    }

    function procesarRespuestaGemini(rawText, esContinuacion = false) {
        try {
            const analisisContenido = document.getElementById("analisisContenido");
            const botonContinuar = document.getElementById("botonContinuarLecturaContainer");
    
            if (!analisisContenido) {
                console.error("No se encontró el contenedor analisisContenido");
                return;
            }
    
            if (!rawText || rawText.trim() === "") {
                if (!esContinuacion) {
                    analisisContenido.innerHTML = "<p>No se pudo generar el análisis.</p>";
                }
                return;
            }
    
            // Extraer sugerencias antes de limpiar
            const sugerencias = extraerSugerencias(rawText);
            console.log("✅ Sugerencias extraídas:", sugerencias);
    
            // Limpiar sección de sugerencias en el HTML para evitar duplicación
            const contieneHTML = /<\/?(html|head|body|div|h\d|p|ul|ol|li|span)[^>]*>/i.test(rawText);
            let htmlAnalisis = contieneHTML ? rawText : formatearTextoConHTML(rawText);
    
            if (contieneHTML) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = htmlAnalisis;
    
                const encabezado = Array.from(tempDiv.querySelectorAll("h1,h2,h3,h4,h5,h6"))
                    .find(h => h.textContent.toLowerCase().includes("sugerencias"));
    
                if (encabezado) {
                    const siguiente = encabezado.nextElementSibling;
                    encabezado.remove();
                    if (siguiente && (siguiente.tagName === "OL" || siguiente.tagName === "UL")) {
                        siguiente.remove();
                    }
                }
    
                htmlAnalisis = tempDiv.innerHTML;
            }
    
            if (esContinuacion) {
                analisisContenido.innerHTML += htmlAnalisis;
            } else {
                analisisContenido.innerHTML = `<div class="analisis-wrapper">${htmlAnalisis}</div>`;
            }
    
            document.getElementById("analisisResultado").style.display = "block";
    
            if (!esContinuacion) {
                renderizarSugerencias(sugerencias);
            } else if (sugerencias.length > 0) {
                agregarSugerenciasASugerenciasGrid(sugerencias);
            }
    
            if (esRespuestaCortadaPorTokens(rawText)) {
                botonContinuar.style.display = "block";
            } else {
                botonContinuar.style.display = "none";
            }
    
        } catch (error) {
            console.error("Error al procesar respuesta Gemini:", error);
            mostrarError("Ocurrió un error procesando el análisis.");
        }
    }
    
        
    

    function renderizarSugerencias(sugerencias) {
        const sugerenciasContenedor = document.getElementById("sugerenciasLecturas");
        
        if (!sugerenciasContenedor) {
            console.error("No se encontró el contenedor de sugerencias");
            return;
        }
    
        if (!sugerencias || sugerencias.length === 0) {
            sugerenciasContenedor.innerHTML = "<p>No se encontraron sugerencias de lecturas.</p>";
            return;
        }
    
        sugerenciasContenedor.innerHTML = `
            <div class="sugerencias-header">
                <h3 class="sugerencias-titulo">Selecciona un tema para generar lectura</h3>
                <p class="sugerencias-subtitulo">Basado en el análisis de tu contenido</p>
            </div>
            <div class="sugerencias-grid" id="sugerenciasGrid"></div>`;
    
        const grid = document.getElementById("sugerenciasGrid");
    
        sugerencias.forEach((sug, i) => {
            if (!sug || typeof sug !== 'string') return;  // ⛔ Evita procesar sugerencias inválidas
        
            const card = document.createElement("div");
            card.className = "sugerencia-card";
            card.dataset.tema = sug;
        
            const [titulo, descripcion] = sug.includes(":") ? 
                [sug.split(":")[0].trim(), sug.split(":")[1].trim()] : 
                [`Sugerencia ${i+1}`, sug];
            
            card.innerHTML = `
                <div class="sugerencia-contenido">
                    <h5>${titulo}</h5>
                    ${descripcion ? `<p>${descripcion}</p>` : ''}
                </div>
                <button class="seleccionar-tema">Seleccionar</button>
            `;
        
            card.querySelector(".seleccionar-tema").addEventListener("click", (e) => {
                e.stopPropagation();
                seleccionTema = card.dataset.tema;
                document.querySelectorAll(".sugerencia-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                document.getElementById("generarLecturaBtn").disabled = false;
                e.target.innerHTML = '<i class="bx bx-check"></i> Seleccionado';
                setTimeout(() => e.target.textContent = 'Seleccionar', 2000);
            });
        
            grid.appendChild(card);
        });
        
    }


    function agregarSugerenciasASugerenciasGrid(sugerencias) {
        const grid = document.getElementById("sugerenciasGrid");
        if (!grid) return;
    
        sugerencias.forEach((sug, i) => {
            if (!sug || typeof sug !== 'string') return;
    
            const card = document.createElement("div");
            card.className = "sugerencia-card";
            card.dataset.tema = sug;
    
            const [titulo, descripcion] = sug.includes(":")
                ? [sug.split(":")[0].trim(), sug.split(":")[1].trim()]
                : [`Sugerencia ${i + 1}`, sug];
    
            card.innerHTML = `
                <div class="sugerencia-card">
                    <h5>${titulo}</h5>
                    ${descripcion ? `<p>${descripcion}</p>` : ""}
                </div>
                <button class="seleccionar-tema">Seleccionar</button>
            `;
    
            card.querySelector(".seleccionar-tema").addEventListener("click", (e) => {
                e.stopPropagation();
                seleccionTema = card.dataset.tema;
                document.querySelectorAll(".sugerencia-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                document.getElementById("generarLecturaBtn").disabled = false;
                e.target.innerHTML = '<i class="bx bx-check"></i> Seleccionado';
                setTimeout(() => e.target.textContent = 'Seleccionar', 2000);
            });
    
            grid.appendChild(card);
        });
    }
    


    function extraerSugerencias(texto) {
        const sugerencias = [];
        const posiblesEncabezados = [
            "SUGERENCIAS DE LECTURA",
            "SUGERENCIAS DE LECTURAS",
            "Lecturas recomendadas",
            "Lecturas sugeridas",
            "Otras lecturas",
            "Lecturas posibles",
            "Sugerencias",
            "Recomendaciones"
        ];
    
        // Limpiar texto de bloques markdown
        texto = texto.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
    
        // Si contiene HTML
        if (/<\/?(ol|ul|li|p|strong|div|h\d)[^>]*>/i.test(texto)) {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = texto;
    
            // Buscar encabezado que coincida con los posibles
            const encabezadoNode = Array.from(tempDiv.querySelectorAll("h1,h2,h3,h4,h5,h6"))
                .find(el => {
                    const textoLimpio = el.textContent.trim().toLowerCase();
                    return posiblesEncabezados.some(encabezado => 
                        textoLimpio.includes(encabezado.toLowerCase())
                    );
                });
    
            if (encabezadoNode) {
                // Buscar lista ordenada o no ordenada más cercana
                let nodoLista = encabezadoNode.parentElement.querySelector("ol, ul");

    
                if (nodoLista) {
                    return Array.from(nodoLista.querySelectorAll("li"))
                        .map(li => li.textContent.trim())
                        .filter(t => t.length > 3)
                        .slice(0, 10);
                }
            }
        }
    
        // Modo texto plano
        let inicio = -1;
        for (let encabezado of posiblesEncabezados) {
            const index = texto.toLowerCase().indexOf(encabezado.toLowerCase());
            if (index !== -1) {
                inicio = index + encabezado.length;
                break;
            }
        }
    
        if (inicio === -1) return [];
    
        const textoDesdeSugerencias = texto.slice(inicio);
        const lineas = textoDesdeSugerencias.split('\n');
    
        for (let linea of lineas) {
            const trimmed = linea.trim();
            if (/^\d+\./.test(trimmed) || /^[-•]/.test(trimmed)) {
                sugerencias.push(
                    trimmed.replace(/^\d+\.\s*/, '')
                          .replace(/^[-•]\s*/, '')
                          .trim()
                );
            } else if (trimmed === "" || /^[A-ZÁÉÍÓÚÑ\s]{3,20}[:：]?$/.test(trimmed)) {
                break;
            }
        }
    
        return sugerencias.slice(0, 10);
    }
    
    
    




    function mostrarError(mensaje) {
        // Limpiar errores anteriores
        const erroresAnteriores = document.querySelectorAll('.error-mensaje');
        erroresAnteriores.forEach(el => el.remove());
        
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-mensaje";
        errorDiv.innerHTML = `
            <i class='bx bx-error'></i>
            <div>
                <strong>Error:</strong>
                <p>${mensaje}</p>
            </div>
        `;
        
        const generadorSection = document.getElementById("generador-lecturas");
        generadorSection.insertBefore(errorDiv, generadorSection.firstChild);
        
        setTimeout(() => {
            errorDiv.classList.add('fade-out');
            setTimeout(() => errorDiv.remove(), 500);
        }, 5000);
    }


    function obtenerClaveEstaciones(nivel, grado, materia) {
    const materiaNormalizada = normalizarMateria(materia);
    if (nivel === "Primaria") {
        if (materiaNormalizada === "Inglés") return "Primaria_Ingles";
        if (["Primero", "Segundo", "Tercero"].includes(grado)) return "Primaria_Baja";
        return "Primaria_Alta";
    }
    if (nivel === "Secundaria") return "Secundaria";
    return `${nivel}_${materiaNormalizada}`;
    }


    function normalizarMateria(nombre) {
        const nombreLower = nombre.toLowerCase();
        if (nombreLower.includes("historia")) return "Historia";
        if (nombreLower.includes("cívica") || nombreLower.includes("ética")) return "Formación Cívica y Ética";
        if (nombreLower.includes("geografía")) return "Geografía";
        if (nombreLower.includes("naturales") || nombreLower.includes("ciencia")) return "Ciencias Naturales";
        if (nombreLower.includes("matemáticas") || nombreLower.includes("mate")) return "Matemáticas";
        if (nombreLower.includes("español")) return "Español";
        if (nombreLower.includes("inglés") || nombreLower.includes("english")) return "Inglés";
        return nombre.trim();
    }
    
    
    const HF_TOKEN = "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"; // << tu token ya está aquí
    const inference = new InferenceClient(HF_TOKEN);


    // 🔵 Extraer los SPECs de la lectura
    function extraerSpecsDeLectura(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const specs = tempDiv.querySelectorAll('.spec p');
        const prompts = [];
    
        for (let i = 0; i < specs.length; i += 2) { 
        const promptEspañol = specs[i]?.textContent.trim();
        const promptIngles = specs[i+1]?.textContent.trim();
        if (promptEspañol && promptIngles) {
            prompts.push({ español: promptEspañol, ingles: promptIngles });
        }
        }
    
        return prompts;
    }
    
    // 🔵 Generar imagen usando stabilityai/stable-diffusion-3.5-large
    async function generarImagenDesdeSpec(promptIngles) {
        try {
            const result = await inference.textToImage({
                model: "stabilityai/stable-diffusion-3.5-large",
                inputs: promptIngles,
                parameters: { width: 768, height: 768 } // 🔥 BAJAR de 1024x1024 a 768x768
            });
    
            if (result instanceof Blob) {
                const blobURL = URL.createObjectURL(result);
                return blobURL;
            } else {
                throw new Error("Respuesta inválida generando imagen desde Hugging Face");
            }
        } catch (error) {
            console.error("❌ Error generando imagen:", error);
            throw error; // Lo relanzamos para que procesarSpecsYGenerarImagenes() lo maneje
        }
    }
    
    



    // GENERAR LECTURA - Versión corregida
    document.getElementById("generarLecturaBtn").addEventListener("click", async () => {


        // Mostrar indicador de carga
        const generarBtn = document.getElementById("generarLecturaBtn");
        const genero = document.getElementById("generoSelect").value;
        const tono = document.getElementById("tonoSelect").value;

        const incluirFichas = document.getElementById("checkFichas").checked;
        const incluirAnexos = document.getElementById("checkAnexos").checked;
        const incluirRecortables = document.getElementById("checkRecortables").checked;
        const temarioTexto = document.getElementById("temarioTexto").innerText.trim();
        const rubricaElemento = document.getElementById("rubricaTexto");
        const gradoSeleccionado = document.getElementById("gradoSelect").value;
        const temaInput = document.getElementById("temaInput")?.value.trim() || "";
        const temaEspecifico = (typeof seleccionTema !== "undefined" && seleccionTema) ? seleccionTema : temaInput;

        if (!temaEspecifico) {
            alert("Por favor escribe un tema específico a desarrollar");
            return;
        }
        const materiaSeleccionada = document.getElementById("materiaSelect")?.value || "No especificada";
        const competenciasSeleccionadas = Array.from(document.getElementById("competenciasSelect")?.selectedOptions || [])
            .map(opt => opt.value)
            .join(", ") || "No seleccionadas";


        // Tomamos la materia principal de tu array (o del select si lo prefieres)
        const materiaPrincipal = document.getElementById('materiaSelect')?.value;

    
        if (!materiaPrincipal || materiaPrincipal === "Selecciona una materia") {
            alert("⚠️ Por favor selecciona una materia válida.");
            return;
        }
        
        const materia = materiaPrincipal;
        const materiaNormalizada = normalizarMateria(materia);

                                      
         // grab it into nivelSeleccionado instead
        const nivelSeleccionado = document.getElementById('nivelSelect').value;

        let idiomaIngles = false;
        if (materia.toLowerCase().includes("inglés") && nivelSeleccionado === "Primaria") {
            idiomaIngles = true;
        }


        let extras = "";
        if (incluirRecortables && nivelSeleccionado === "Primaria") {
            extras += "- Incorporar ejercicios con recortables (tarjetas, objetos, etc.) para complementar la actividad.\n";
        }

        // and use nivelSeleccionado when looking up estaciones:
        const clave = obtenerClaveEstaciones(nivelSeleccionado, gradoSeleccionado, materiaNormalizada);
        let estaciones = [];


        const estacionesPorNivelYMateria = {
            "Secundaria": {
              "Historia de México": [
                "Análisis de fuentes primarias",
                "Línea del tiempo",
                "Perspectiva crítica",
                "Conexión con el presente"
              ],
              "Historia del mundo": [
                "Exploración de civilizaciones",
                "Eventos clave",
                "Comparación de culturas",
                "Debate histórico"
              ],
              "Matemáticas": [
                "Conceptos matemáticos",
                "Retos matemáticos",
                "Lógica matemática",
                "Matematización"
              ],
              "General": [
                "Exploración", "Análisis", "Aplicación", "Reflexión"
              ]
            },
            "Primaria_Alta": {
              "Historia": [
                "Contexto histórico",
                "Personajes clave",
                "Cronología básica",
                "Mi opinión sobre lo aprendido"
              ]
            },
            "Primaria_Baja": {
              "Español": [
                "Lectura guiada",
                "Escritura creativa",
                "Vocabulario visual",
                "Juegos de comprensión"
              ]
            },
            "Primaria_Ingles": {
              "Inglés": [
                "Reading",
                "Vocabulary",
                "Say It Right",
                "Mind Map",
                "Listening Comprehension"
              ]
            }
          };
          
    
    

        if (estacionesPorNivelYMateria[clave]) {
            if (estacionesPorNivelYMateria[clave][materiaNormalizada]) {
                estaciones = estacionesPorNivelYMateria[clave][materiaNormalizada];
            } else if (estacionesPorNivelYMateria[clave]["General"]) {
                estaciones = estacionesPorNivelYMateria[clave]["General"];
            }
        }
        
        
        

        console.log("📚 Clave usada:", clave);
        console.log("📌 Estaciones obtenidas:", estaciones);
        
        
        if (nivelSeleccionado === "Secundaria" && !estaciones.length) {
            alert(`No hay estaciones configuradas para ${materia} / ${nivelSeleccionado}.`);
            return;
        }
      
        if (incluirFichas) {
        extras += "- Incluir una ficha de trabajo con ejercicios complementarios.\n";
        }
        if (incluirAnexos) {
        extras += "- Añadir anexos como mapas conceptuales, líneas del tiempo u otros recursos visuales.\n";
        }


        generarBtn.disabled = true;
        generarBtn.innerHTML = '<i class="bx bx-loader bx-spin"></i> Generando...';



        try {
            const textoOriginal = document.getElementById("lecturaOriginal").innerHTML.trim();


            let estacionesHTML = "";

            if (estaciones.length > 0) {
              estacionesHTML = `
              A CONTINUACIÓN, las estaciones para ${materia} (${nivelSeleccionado}), cada una en <h2>:
              ${estaciones.map((e, i) => `<h2>${i + 1}ª Estación: ${e}</h2>`).join("\n")}
              `;
            }
            


            let prompt = `
           
        PASO 1: analizar el Temario ${temarioTexto} (si  existe), la Contextualización pedagógica  ${rubricaHTML}(si  existe), la lectura original (solo si existe) ${textoOriginal}(si  existe), el Archivo ${archivoTexto}(si  existe) y en base a lo anterior, crear una lectura educativa basada en el tema: "${temaEspecifico}", para la materia ${materiaSeleccionada} del género literario ${genero}, usa un tono ${tono} con grado de dificultad según el nivel educativo ${nivelSeleccionado}, específicamente para el grado ${gradoSeleccionado} (tomando en cuenta que el nivel de lectura y comprensión debe ser alto, con palabras difíciles de saber siginificado), y crea las actividades segun las ${competenciasSeleccionadas} sigue la estructura de competencias o estaciones según la metodoogía ASC ${metodologiaASC} . 
                
            IMPORTANTE: devuelve solo el HTML solicitado.
            IMPORTANTE: palabras clave dentro de <b>palabra clave</b>. No usar **                 

            IMPORTANTE: para la materia inglés revisa ${estacionesHTML} Primaria_ingles y Secundaria   Importante: las **Competencias 
            IMPORTANTE: (devuelve solo el resultado sin comentarios extras ni indicaciones de la ia)
            IMPORTANTE: Lecturas sin derecho de autor, pueden ser ficticias  

            Especificaciones:
                Lectura Extensión: [200 palabras para grados bajos como Primero de Primaria y hasta 600 para grados altos como Sexto de Primaria, y más de 1200 en adelante para Primero, Segundo y Tercero de Secundaria]. Genera la lectura para el grado: ${gradoSeleccionado}.
                **IMPORTANTE: Incluir un SPECs visual bien detallado dentro de un div con class="spec". Cada espec debe tener una descripción visual clara, detallada, que incluya: estilo artístico, composición, colores, personajes, acción y contexto, muy detallado en formato de prompt para que cualquier modelo text-to-image pueda interpretar bien la imagen.
                IMPORTANTE agregar spec en español y en inglés y validar antes para no usar personajes con derecho  de autor

            Formato spec:
                <div class="spec">
                <strong>Ilustración sugerida:</strong> 
                <p>Un niño explorador caminando entre montañas nevadas mientras lleva una brújula en la mano. Estilo digital semirrealista, tonos fríos y fondo difuminado.</p>
                <p>A boy scout walks through snowy mountains while holding a compass. Semi-realistic digital style, cool tones, and a blurred background.</p>
                </div>
                <div id="specsImagenContainer"></div>


    
            📋 Estructura solicitada (usa etiquetas HTML reales):
                - <h1>Título principal</h1>
                - <h2>Subtítulo</h2> (opcional)
                - <p>Lectura y spec</p>
                - <table>Tabla con palabras clave y sinónimos</table>
                - <p><strong>Fuentes bibliográficas en formato APA</strong></p>
                - incluir: glosario de palabras complejas, preguntas al final, etc.

            Importante: mantener esta estructura: ${estructuraCompletaPorNivel}

            seprar con hr

    PASO 2: (no incluir comentarios de la ia)
            seprar con hr
            
            con base en la  metodología Metodologia ASC ${metodologiaASC} y la ESTRUCTURA DE COMPTENCIAS según el nivel academico ${nivelSeleccionado} dictada  más abajo..
           enera una serie de Actividades y ejercicios didácticos de cada una de las COMPETENCIAS A USAR EN LAS UNIDADES segun la Estructura segun el nivel académico ${nivelSeleccionado},
            
            IMPORTANTE: usa un estilo de cuaderno de trabajo profesional, en HTML estructurado, organizado por competencias.
            Importante añadir las respuestas o respuesta sugerida de las actividades en color magenta.
            

            IMPORTANTE: AÑADIR NOTAS DEL MAESTRO Y NEUROLOGÍA APLICADA SEGÚN LA ${metodologiaASC} 
            Importante: incluir los elementos 📄 FICHAS DE TRABAJO, 📎 ANEXO Y ✂️ RECORTABLES en una de cada 3 actividades para el nivel Primaria
            ${incluirFichas ? `<div class="fichaTrabajo">📄 Ficha de trabajo con ejercicios complementarios</div>` : ''} se debe indicar con qué actividad de Compentencia está relacionada y dar instrucciones claras y detalladas, incluir de 3 a 5 ejercicios en la Ficha de trabajo
            ${incluirAnexos ? `<div class="anexoVisual">📎 Anexo visual como mapa conceptual o línea del tiempo</div>` : ''} se debe indicar con qué actividad de Compentencia está relacionada y dar instrucciones claras y detalladas de como se usarán los anexos en la actividad, los anexos pueden incluir información adiciónal complementaria a la actividad
            ${incluirRecortables && nivel === "Primaria" ? `<div class="recortable">✂️ Actividad con recortables: tarjetas o figuras recortables, </div>` : ''} se debe indicar con qué actividad de Compentencia está relacionada y dar instrucciones claras y detalladas de cómo se usará el recortable en la actividad, 

            
            📘 Al final del documento, agrega una sección especial de **Autoevaluación o Reflexión general del alumno**, presentada también como una sección HTML.

        seprar con hr

           IMPORTANTE añadir esta nota con estilo class="alertaIA" al final de cada sección:  ⚠️ IMPORTANTE revisar todo el contenido generado con la IA,


        seprar con hr

    PASO 3:


    
                IMPORTANTE:
                -títulos en h1
                -reinicia la numeración de las actividades en cada Competencia 

                IMPORTANTE añadir esta nota con dentro de un div con el estilo class="alertaIA" en cada Competencia: ⚠️ Es IMPORTANTE Revisar todo el contenido generado con la IA.


            `;

            if (idiomaIngles) {
                prompt += `
            
                🛑 IMPORTANTE: Toda la lectura, Competencias, Actividades, ejercicios, instrucciones y contenido deben estar escritos en **inglés**. 
                Usa un nivel de inglés apropiado para estudiantes de ${gradoSeleccionado} de primaria.
                Asegúrate de que todas las instrucciones, glosarios, preguntas y respuestas también estén completamente en inglés.
                `;
            }

            const body = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000
                }
            };

            const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();
            console.log("Respuesta de Gemini:", data);
            
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.error("La respuesta de la API no contiene texto válido");            
                throw new Error("La respuesta no contiene texto válido");
            }

            lecturaGenerada = data.candidates[0].content.parts[0].text;
            
            // Eliminar ```html y ```   
            lecturaGenerada = lecturaGenerada.replace(/```(?:html)?/gi, '').trim();

            
            // Mostrar el resultado en Trumbowyg
            document.getElementById("editorLectura").style.display = "block";
            const esHTML = /<\/?(html|head|body|h\d|p|ul|li|div|table)[^>]*>/i.test(lecturaGenerada);
            const contenidoFinal = esHTML ? lecturaGenerada : marked.parse(lecturaGenerada);
            $('#textoLectura').trumbowyg('html', contenidoFinal);
            guardarFormularioEnLocalStorage();

            // 🔵 Primero mostrar el botón de continuar
            document.getElementById("continuarGeneracionBtn").style.display = "inline-block";

  
            // Si la respuesta fue cortada, continuar automáticamente
            if (esRespuestaCortadaPorTokens(lecturaGenerada)) {
                console.warn("⚠️ Lectura cortada por tokens. Iniciando continuación...");
                await forzarContinuacionAutomatica(lecturaGenerada);
            }

        } catch (error) {
            console.error("Error al generar lectura:", error);
            mostrarError(`Error al generar lectura: ${error.message}`);
        } finally {
            generarBtn.disabled = false;
            generarBtn.textContent = "Generar lectura";
        }
    });


    const nivelSelect = document.getElementById("nivelSelect");
    const gradoSelect = document.getElementById("gradoSelect");

    const gradosPorNivel = {
        "Preescolar": ["Primero", "Segundo", "Tercero"],
        "PF": ["Preprimaria"],
        "Primaria": ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"],
        "Secundaria": ["Primero", "Segundo", "Tercero"]
    };
    
    nivelSelect.addEventListener("change", () => {
        const nivel = nivelSelect.value;
        gradoSelect.innerHTML = '<option value="">-- Selecciona un grado --</option>';
        if (gradosPorNivel[nivel]) {
        gradosPorNivel[nivel].forEach(grado => {
            const opt = document.createElement("option");
            opt.value = grado;
            opt.textContent = grado;
            gradoSelect.appendChild(opt);
        });
        }
    });


    async function forzarContinuacionAutomatica(textoBase, intento = 1) {
        if (continuacionEnCurso) {
            console.warn("⚠️ Ya hay una continuación automática en curso. Abortando duplicado.");
            return;
        }
        continuacionEnCurso = true;

        console.log("⏭️ Forzando continuación automática de lectura... (intento " + intento + ")");
        const temaEspecifico = (typeof seleccionTema !== "undefined" && seleccionTema) ? seleccionTema : temaInput;

        if (!temaEspecifico) {
            alert("Por favor escribe un tema específico a desarrollar");
            return;
        }

        const nivelSeleccionado = typeof nivelSeleccionadoGlobal !== "undefined" ? nivelSeleccionadoGlobal : "Nivel no definido";
        const gradoSeleccionado = typeof gradoSeleccionadoGlobal !== "undefined" ? gradoSeleccionadoGlobal : "Grado no definido";
        const materiaSeleccionada = Array.isArray(materiasSeleccionadas) && materiasSeleccionadas.length > 0
          ? materiasSeleccionadas[0]
          : "materia no especificada";

        const competenciasSeleccionadas = (
        document.getElementById("competenciasSelect")?.selectedOptions
            ? Array.from(document.getElementById("competenciasSelect").selectedOptions).map(opt => opt.value)
            : []
        );
        const genero = document.getElementById("generoSelect")?.value || "sin género";
        const tono = document.getElementById("tonoSelect")?.value || "neutral";

        const body = {
            contents: [{
                parts: [{ text: `


                    IMPORTANTE: continúa el sin repetir lo anterior.
                    Cierra cualquier etiqueta abierta y sigue desde donde se quedó:

                    continua generando las actividades para el tema "${temaEspecifico}", para la materia ${materiaSeleccionada} del género literario ${genero}, usa un tono ${tono} con grado de dificultad según el nivel educativo ${nivelSeleccionado}, específicamente para el grado ${gradoSeleccionado} y crea las actividades segun las ${competenciasSeleccionadas} sigue la estructura de competencias o estaciones según la metodoogía ASC ${metodologiaASC} y sigue esta  estructura de estaciones o competencias según el ${nivelSeleccionado} . 


                    Importante: mantener esta estructura: ${estructuraCompletaPorNivel}                                  
                                

    
                    ${textoBase}
                ` }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000
            }
        };
    
        try {
            const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
    
            if (!response.ok) {
                if (response.status === 503 && intento < 3) {
                    console.warn(`⚠️ API no disponible, reintentando en 3 segundos (intento ${intento + 1})...`);
                    await new Promise(res => setTimeout(res, 3000));
                    return forzarContinuacionAutomatica(textoBase, intento + 1);
                } else {
                    throw new Error(`Error HTTP ${response.status}`);
                }
            }
    
            const data = await response.json();
            const textoNuevo = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
            if (!textoNuevo || textoNuevo.length < 20) {
                console.warn("⚠️ No se recibió contenido nuevo al continuar.");
                return;
            }
    
            const textoLimpio = textoNuevo.replace(/```html|```/g, "").trim();
            lecturaGenerada += "\n" + textoLimpio;
    
            const esHTML = /<\/?(html|head|body|h\d|p|ul|li|div|table)[^>]*>/i.test(lecturaGenerada);
            const contenidoFinal = esHTML ? lecturaGenerada : marked.parse(lecturaGenerada);
            $('#textoLectura').trumbowyg('html', contenidoFinal);
    
    
            if (esRespuestaCortadaPorTokens(textoLimpio)) {
                console.log("🔁 Segunda parte también se cortó, generando otra...");
                await forzarContinuacionAutomatica(lecturaGenerada);
            }

            if (!textoNuevo || textoNuevo.length < 20) {
                console.warn("⚠️ No se recibió contenido nuevo al continuar.");
                
                if (intento < 3) {
                    console.log(`🔁 Reintentando continuación automática... intento ${intento + 1}`);
                    await new Promise(res => setTimeout(res, 3000));
                    return forzarContinuacionAutomatica(textoBase, intento + 1);
                } else {
                    mostrarError("No se pudo continuar la lectura automáticamente tras varios intentos.");
                    return;
                }
            }
            
            guardarFormularioEnLocalStorage();


        } catch (err) {
            console.error("❌ Error al forzar continuación automática:", err);
            mostrarError("No se pudo continuar la lectura automáticamente.");
        } finally {
            continuacionEnCurso = false;
        }
    }

    document.getElementById("continuarGeneracionBtn").addEventListener("click", async () => {
        const continuarBtn = document.getElementById("continuarGeneracionBtn");
        continuarBtn.disabled = true;
        continuarBtn.innerHTML = '<i class="bx bx-loader bx-spin"></i> Generando más...';
        
        // Obtener valores del formulario
        const gradoSeleccionado = document.getElementById("gradoSelect").value;
        const tonoSeleccionado = document.getElementById("tonoSelect").value;
        const generoSeleccionado = document.getElementById("generoSelect").value;
        const incluirFichas = document.getElementById("checkFichas").checked;
        const incluirAnexos = document.getElementById("checkAnexos").checked;
        const incluirRecortables = document.getElementById("checkRecortables").checked;
        const materiaPrincipal = document.getElementById("materiaSelect").value || "materia general";
        const nivelSeleccionado = document.getElementById("nivelSelect").value;
        const temaEspecifico = document.getElementById("temaInput").value.trim();
        
        // Obtener contenido actual del editor
        const contenidoActual = $('#textoLectura').trumbowyg('html');
        lecturaGenerada = contenidoActual; // Actualizamos la variable global
    
        // Definir estructura por nivel
        let estructuraPorNivel;
        if (nivelSeleccionado === "Primaria") {
            estructuraPorNivel = `
            Según la Metodología ASC ${metodologiaASC} para Primaria, continua generando las Competencias:
            - Para Primaria Baja: 1. Comprensión lectora (3 act.), 2. Expresión oral (1 act.), 3. Expresión escrita (3 act.)
            - Para Primaria Alta: 1. Ortografía (3-5 act.), 2. Gramática (3-5 act.), ... 11. Matemáticas (6-8 act.)
            Recuerda reiniciar numeración de actividades por competencia.`;
        } else if (nivelSeleccionado === "Secundaria") {
            estructuraPorNivel = `
            Según la Metodología ASC ${metodologiaASC} para Secundaria, continua generando las COMPETENCIAS  O Estaciones:

            
            Importante: mantener esta estructura: ${estructuraCompletaPorNivel}            
                        
            `;
        } else {
            estructuraPorNivel = `Estructura genérica para continuar la generación`;
        }
    
        try {
            const promptContinuacion = `
    IMPORTANTE: Continúa EXACTAMENTE desde donde te quedaste.
    NO repitas nada de lo ya generado.
    NO agregues introducciones ni resúmenes.
    Cierra cualquier etiqueta HTML abierta antes de continuar.
    Mantén el mismo estilo, formato y estructura.
    
    CONTENIDO ACTUAL (continúa después de esto):
    ${contenidoActual}
    
    INSTRUCCIONES PARA CONTINUAR:
    1. Analiza dónde terminó el contenido actual
    2. Continúa generando solo lo que falta
    3. Mantén la coherencia con lo ya generado
    4. Usa el mismo formato HTML y la estructura de commpetencias y estaciones según ${metodologiaASC}
    5. Si había una lista o tabla incompleta, termínala
    6. Si eran actividades por competencia, continúa con las siguientes
    7. No agregues títulos o secciones que ya existen
    
    ${estructuraCompletaPorNivel}
    
    PARA MATEMÁTICAS (si aplica):
    - Usar los temas según el ${nivelSeleccionado}
    - Incluir ejercicios con progresión de dificultad
    - No repetir ejercicios ya incluidos
    
    ELEMENTOS ADICIONALES:
    ${incluirFichas ? '- Incluir ficha de trabajo con ejercicios complementarios' : ''}
    ${incluirAnexos ? '- Añadir anexos visuales como mapas conceptuales' : ''}
    ${incluirRecortables && nivelSeleccionado === "Primaria" ? '- Incluir actividad con recortables' : ''}
    
    IMPORTANTE: NO REPETIR CONTENIDO YA GENERADO
    `;
    
            const body = {
                contents: [{
                    parts: [{ text: promptContinuacion }]
                }],
                generationConfig: {
                    temperature: 0.5, // Reducido para mayor coherencia
                    maxOutputTokens: 2500
                }
            };
    
            const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
    
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
    
            const data = await response.json();
            const textoNuevo = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
            if (!textoNuevo) throw new Error("Respuesta vacía al continuar generación");
    
            // Limpieza del texto nuevo
            let textoLimpio = textoNuevo.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
            
            // Combinar con el contenido existente
            lecturaGenerada = contenidoActual + "\n" + textoLimpio;
    
            // Actualizar el editor
            const esHTML = /<\/?[a-z][\s\S]*>/i.test(lecturaGenerada);
            const contenidoFinal = esHTML ? lecturaGenerada : marked.parse(lecturaGenerada);
            $('#textoLectura').trumbowyg('html', contenidoFinal);
            guardarFormularioEnLocalStorage();
    
        } catch (error) {
            console.error("Error al continuar generación:", error);
            mostrarError("Error al continuar la lectura: " + error.message);
        } finally {
            continuarBtn.disabled = false;
            continuarBtn.textContent = "Continuar generando";
        }
    });
    



    // GUARDAR LECTURA EN FIRESTORE
    document.getElementById("guardarLecturaBtn").addEventListener("click", async () => {
        const textoFinal = $('#textoLectura').trumbowyg('html');
        // 🔍 Obtener datos del usuario desde la colección "users"
        const userDocRef = doc(db, "users", currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        let autorNombre = "Anónimo";
        let autorEmail = "";

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const nombre = userData.firstName || "";
            const apellido = userData.lastName || "";
            autorNombre = `${nombre} ${apellido}`.trim() || "Anónimo";
            autorEmail = userData.email || "";
        }

        if (!textoFinal || textoFinal.trim() === "<p><br></p>") {
            alert("Texto vacío");
            return;
        }
        
        if (!currentUserId || !unidadId) {
            alert("Error: No se ha identificado la unidad o usuario.");
            return;
        }

        try {
            // 📝 Guardar lectura con nombre del autor
            await addDoc(collection(db, "lecturas"), {
                userId: currentUserId,
                unidadId: unidadId,
                texto: textoFinal,
                tema: seleccionTema,
                formato: 'html',
                createdAt: new Date(),
                autorNombre: autorNombre,
                autorEmail: autorEmail
            });

            alert("Lectura guardada correctamente.");
            await cargarLecturas();
            
            // 👇 Cerrar el generador visualmente
            document.getElementById("generador-lecturas").style.display = "none";

        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Error al guardar la lectura. Revisa la consola.");
        }
    });


    document.getElementById("exportarModalInDesignBtn").addEventListener("click", () => {
        const contenidoHTML = $('#modalEditor').trumbowyg('html');

        if (!contenidoHTML || contenidoHTML.trim() === "") {
            alert("No hay contenido para exportar.");
            return;
        }

        const div = document.createElement("div");
        div.innerHTML = contenidoHTML;

        let taggedText = "<ASCII-MAC>\r" + eliminarEmojis(convertirNodo(div));

        taggedText = normalizarCaracteresCorruptos(taggedText);
        taggedText = taggedText.replace(/\r?\n|\n/g, '\r');

        const latin1Text = unescape(encodeURIComponent(taggedText));
        const blob = new Blob([latin1Text], { type: "text/plain;charset=iso-8859-1" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "lectura_indesign.txt";
        a.click();
        URL.revokeObjectURL(url);
    });


    function stripHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
    }

    const obtenerDatosUnidad = async (unidadId) => {
        if (!unidadId) return null;
        try {
            const docSnap = await getDoc(doc(db, "Unidades", unidadId));
            if (docSnap.exists()) {
                return docSnap.data();
            }
        } catch (err) {
            console.error("Error obteniendo datos de la unidad:", err);
        }
        return null;
    };
    
    // CARGAR LECTURAS GUARDADAS
    async function cargarLecturas() {
        const cont = document.getElementById("listaLecturas");
        cont.innerHTML = "<p>Cargando lecturas...</p>";
        
        // Verificar que tenemos los IDs necesarios
        if (!currentUserId || !unidadId) {
            console.error("Faltan datos para cargar lecturas:", {currentUserId, unidadId});
            cont.innerHTML = "<p>Error: Faltan datos para cargar lecturas.</p>";
            return;
        }

        try {
            console.log("Buscando lecturas para:", {
                userId: currentUserId,
                unidadId: unidadId
            });

            const q = query(
                collection(db, "lecturas"),
                where("userId", "==", currentUserId),
                where("unidadId", "==", unidadId)
            );
            
            const snapshot = await getDocs(q);
            console.log("Resultados de consulta:", snapshot.docs.map(doc => doc.data()));

            if (snapshot.empty) {
                cont.innerHTML = "<p>No hay lecturas guardadas para esta unidad.</p>";
                return;
            }


  

            cont.innerHTML = "";

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const datosUnidad = await obtenerDatosUnidad(data.unidadId);
              
                const div = document.createElement("div");
                div.classList.add("lectura-card");
              
                // ✅ Agregamos atributos de filtro como dataset
                div.dataset.nivel = (datosUnidad?.nivel || "").toLowerCase();
                div.dataset.grado = (datosUnidad?.grado || "").toLowerCase();
                div.dataset.trimestre = (datosUnidad?.trimestre || "").toString();
                div.dataset.unidad = (datosUnidad?.unidad || "").toString();
              
                const encabezadoUnidad = datosUnidad ? `
                  <div class="lectura-encabezado">
                    <strong>${datosUnidad.materia || 'Materia no definida'}</strong> – 
                    ${datosUnidad.nombreUnidad || 'Sin nombre'}
                    <br>
                    <small>
                      Nivel: ${datosUnidad.nivel || '-'} | 
                      Grado: ${datosUnidad.grado || '-'} | 
                      Trimestre ${datosUnidad.trimestre || '-'}, Unidad ${datosUnidad.unidad || '-'}
                    </small>
                  </div>
                ` : '';
              
                div.innerHTML = `
                  ${encabezadoUnidad}
                  <h4>${data.tema || 'Sin título'}</h4>
                  <p class="lectura-preview">
                    ${stripHTML(data.texto).slice(0, 120)}${stripHTML(data.texto).length > 120 ? '...' : ''}
                  </p>
                  <div class="lectura-meta">
                    <small>${data.createdAt?.toDate()?.toLocaleDateString() || 'Fecha no disponible'}</small>
                    <div class="lectura-acciones">
                      <button class="editar-lectura" data-id="${doc.id}" title="Editar"><i class="fas fa-pen"></i></button>
                      <button class="eliminar-lectura" data-id="${doc.id}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                      <button class="toggle-estatus" data-id="${doc.id}" title="Compartir lectura">
                        <i class="fas fa-share-alt" style="color: ${data.estatusLectura === 'Compartido' ? 'green' : 'gray'}"></i>
                      </button>
                    </div>
                  </div>
                `;
              
                // 🎯 Tilt effect
                VanillaTilt.init(div, {
                  max: 2,
                  speed: 400,
                  glare: true,
                  "max-glare": 0.5
                });
              
                cont.appendChild(div);
              }
                          
            document.querySelectorAll('.editar-lectura').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const button = e.currentTarget;
                    const docId = button.getAttribute('data-id');
                    await mostrarLecturaCompleta(docId);
                });
            });

            document.querySelectorAll('.toggle-estatus').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                  const docId = e.currentTarget.getAttribute('data-id');
                  if (!docId) return;
              
                  try {
                    const docRef = doc(db, "lecturas", docId);
                    const snap = await getDoc(docRef);
              
                    if (!snap.exists()) return;
                    const data = snap.data();
              
                    if (data.estatusLectura === "Compartido") {
                      // Descompartir
                      await updateDoc(docRef, {
                        estatusLectura: "Editando",
                        sharewith: []
                      });
              
                      alert("❌ Lectura descompartida");
                      await cargarLecturas();
                    } else {
                      // Mostrar modal de compartir
                      mostrarModalCompartirLectura(docId);
                    }
                  } catch (error) {
                    console.error("Error al alternar compartir:", error);
                    alert("Hubo un error al cambiar el estatus.");
                  }
                });
              });
              
            
            
            

            // Agregar evento a botones de eliminar (¡IMPORTANTE!)
            document.querySelectorAll('.eliminar-lectura').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const button = e.currentTarget;
                    const docId = button.getAttribute('data-id');
                    if (confirm("¿Estás seguro de que deseas eliminar esta lectura?")) {
                        try {
                            await deleteDoc(doc(db, "lecturas", docId));
                            await cargarLecturas(); // Recargar lista
                        } catch (error) {
                            console.error("Error al eliminar lectura:", error);
                            mostrarError("No se pudo eliminar la lectura.");
                        }
                    }
                });
            });
                    

            // Agregar eventos a los botones "Ver completo"
            document.querySelectorAll('.ver-mas').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const docId = e.target.getAttribute('data-id');
                    mostrarLecturaCompleta(docId);
                });
            });

        } catch (error) {
            console.error("Error al cargar lecturas:", error);
            cont.innerHTML = `<p>Error al cargar lecturas: ${error.message}</p>`;
        }
    }


    let lecturaIdCompartir = null;

    async function mostrarModalCompartirLectura(docId) {
      lecturaIdCompartir = docId;
      document.getElementById("modalCompartirLectura").style.display = "block";
    
      const select = document.getElementById("emailCompartirLectura");
      select.innerHTML = '<option disabled>Cargando usuarios...</option>';
    
      try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = "";
    
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const option = document.createElement("option");
          option.value = docSnap.id;
          option.textContent = data.nombre || data.email || "Sin nombre";
          select.appendChild(option);
        });
      } catch (e) {
        console.error("Error al cargar usuarios:", e);
        select.innerHTML = '<option disabled>Error al cargar</option>';
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const btnTodos = document.getElementById("btnCompartirTodos");
        const btnUsuario = document.getElementById("btnCompartirUsuario");
        const modal = document.getElementById("modalCompartirLectura");
      
        if (btnTodos && modal) {
          btnTodos.addEventListener("click", async () => {
            if (!lecturaIdCompartir) return;
      
            const docRef = doc(db, "lecturas", lecturaIdCompartir);
            await updateDoc(docRef, {
              estatusLectura: "Compartido",
              sharewith: ["todos"]
            });
      
            alert("✅ Compartido públicamente");
            modal.style.display = "none";
            await cargarLecturas();
          });
        }
      
        if (btnUsuario && modal) {
          btnUsuario.addEventListener("click", async () => {
            const select = document.getElementById("emailCompartirLectura");
            const seleccionados = Array.from(select.selectedOptions).map(opt => opt.value);
      
            if (!lecturaIdCompartir || seleccionados.length === 0) {
              alert("Selecciona al menos un usuario.");
              return;
            }
      
            const docRef = doc(db, "lecturas", lecturaIdCompartir);
            await updateDoc(docRef, {
              estatusLectura: "Compartido",
              sharewith: seleccionados
            });
      
            alert("✅ Compartido con usuario(s) seleccionado(s)");
            modal.style.display = "none";
            await cargarLecturas();
          });
        }


        const cerrar = document.querySelector("#modalCompartirLectura .close");
        if (cerrar) {
          cerrar.addEventListener("click", () => {
            document.getElementById("modalCompartirLectura").style.display = "none";
          });
        }
                
      });

      document.addEventListener('DOMContentLoaded', function() {
        // 🔥 Forzar ocultar el editorLectura al cargar

        const cerrarEditorLecturaBtn = document.getElementById('cerrarEditorLecturaBtn');
        const editorLectura = document.getElementById('editorLectura');
        if (cerrarEditorLecturaBtn && editorLectura) {
          cerrarEditorLecturaBtn.addEventListener('click', () => {
            editorLectura.style.display = 'none';
          });
        }

        

      });
      

      
  
    // 3. Función para mostrar lectura completa
    async function mostrarLecturaCompleta(docId) {
        try {
            const modal = document.getElementById('lecturaModal');
            const editor = document.getElementById('modalEditor');
            const titulo = document.getElementById('modalTitulo');
            
            const docRef = doc(db, "lecturas", docId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
            
                // Reemplaza contenido
                titulo.textContent = data.tema || 'Lectura sin título';

                // Inicializar el editor si no está activado aún
                if (!$('#modalEditor').hasClass('trumbowyg-editor')) {
                    $('#modalEditor').trumbowyg({
                        svgPath: 'https://cdnjs.cloudflare.com/ajax/libs/Trumbowyg/2.27.3/ui/icons.svg',
                        lang: 'es',
                        autogrow: true,
                        btns: [
                            ['viewHTML'],
                            ['undo', 'redo'],
                            ['formatting'],
                            ['strong', 'em', 'del'],
                            ['superscript', 'subscript'],
                            ['link'],
                            ['insertImage'],
                            ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
                            ['unorderedList', 'orderedList'],
                            ['horizontalRule'],
                            ['removeformat'],
                            ['fullscreen']
                        ]
                    });
                }
                
                // Establecer el contenido HTML
                $('#modalEditor').trumbowyg('html', data.texto || '');
                $('#modalEditor').data('docId', docId); // Guardar ID
                
                modal.style.display = 'block';


            }
            
        } catch (error) {
            console.error("Error al mostrar lectura:", error);
            mostrarError("Error al cargar la lectura completa.");
        }
    }

    // Cerrar modal cuando se hace clic en la X
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('lecturaModal').style.display = 'none';
    });

    // Cerrar modal cuando se hace clic fuera del contenido
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('lecturaModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Cerrar modal con el botón
    document.getElementById('cerrarModalBtn').addEventListener('click', () => {
        document.getElementById('lecturaModal').style.display = 'none';
    });

    document.addEventListener('click', async (e) => {
        
        console.log("¡Click detectado!");
        const guardarBtn = e.target.closest('#guardarCambiosBtn');
        if (!guardarBtn) return;

        const editor = document.getElementById('modalEditor');
        const docId = $('#modalEditor').data('docId');
        const nuevoTexto = $('#modalEditor').trumbowyg('html').trim();

        if (!docId || !nuevoTexto) {
            mostrarError("No se puede guardar el texto vacío");
            return;
        }

        try {
            const docRef = doc(db, "lecturas", docId);
            await updateDoc(docRef, {
                texto: nuevoTexto,
                updatedAt: new Date()
            });

            await cargarLecturas();
            document.getElementById('lecturaModal').style.display = 'none';
        } catch (error) {
            console.error("Error al guardar cambios:", error);
            mostrarError("Error al guardar los cambios");
        }
    });



    $(document).ready(function() {
        $('#textoLectura').trumbowyg({
            svgPath: 'https://cdnjs.cloudflare.com/ajax/libs/Trumbowyg/2.27.3/ui/icons.svg',
            lang: 'es',
            autogrow: true,
            removeformatPasted: false,
            btns: [
              ['viewHTML'],
              ['undo', 'redo'],
              ['formatting'],
              ['strong', 'em', 'del'],
              ['superscript', 'subscript'],
              ['fontsize'],
              ['foreColor', 'backColor'],
              ['link'],
              ['insertImage', 'base64'],
              ['upload', 'noembed'],
              ['highlight'],
              ['table'],
              ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
              ['unorderedList', 'orderedList'],
              ['horizontalRule'],
              ['removeformat'],
              ['fullscreen']
            ]
          });
          
        
        guardarFormularioEnLocalStorage();
    });





    function convertirNodo(nodo) {
        if (nodo.nodeType === 3) return nodo.textContent;

        const tag = nodo.tagName?.toLowerCase();
        const contenido = Array.from(nodo.childNodes).map(convertirNodo).join("");

        const paraStyle = nodo.getAttribute?.("data-parastyle");
        const charStyle = nodo.getAttribute?.("data-charstyle");


        // 👉 Detectar .spec para estilo de párrafo SPEC
        if (tag === 'div' && nodo.classList?.contains('spec')) {
            return `<ParaStyle:SPEC>${contenido}\r`;
        }


        // Aplicar estilo de carácter si existe
        if (charStyle) {
            return `<CharStyle:${charStyle}>${contenido}<CharStyle:>`;
        }

        // Aplicar estilo de párrafo si existe
        if (paraStyle) {
            return `<ParaStyle:${paraStyle}>${contenido}\r`;
        }

        switch (tag) {
            case 'h1':
                return `<ParaStyle:TITULO>${contenido}\r`;

            case 'h2':
                return `<ParaStyle:SUBTITULO>${contenido}\r`;

            case 'p': {
                const texto = nodo.textContent.trim();
                const esInstruccion = /^instrucciones[:：]/i.test(texto);
                const estilo = esInstruccion ? 'INSTRUCCION' : 'TEXTO';
                return `<ParaStyle:${estilo}>${contenido}\r`;
            }

            case 'ul':
            case 'ol':
                return contenido; // Listas procesan sus <li>

            case 'li': {
                const parent = nodo.parentElement;
                const parentTag = parent?.tagName?.toLowerCase();
                const abuelo = parent?.parentElement;
                const esAnidada = abuelo && (abuelo.tagName?.toLowerCase() === 'ul' || abuelo.tagName?.toLowerCase() === 'ol');
                
                let estilo = "TEXTO"; // Estilo por defecto
            
                if (parentTag === 'ol' && parent?.type === '1') {
                    estilo = "INSTRUCCION"; // Lista numerada (1, 2, 3...)
                } else if (parentTag === 'ol' && parent?.type === 'a') {
                    estilo = "SUBINSTRUCCION"; // Lista con letras (a, b, c...)
                } else if (parentTag === 'ul' || esAnidada) {
                    estilo = "SUBINSTRUCCION NIVEL 2"; // Viñetas o listas dentro de otras
                }
            
                return `<ParaStyle:${estilo}>${contenido}\r`;
            }
                
            case 'strong':
            case 'b':
                return `<CharStyle:BOLD>${contenido}<CharStyle:>`;

            case 'em':
            case 'i':
                return `<CharStyle:ITALIC>${contenido}<CharStyle:>`;

            case 'td':
                return `${contenido}\t`;

            case 'tr':
                return `${contenido}\r`;

            default:
                // Por defecto, aplicar estilo TEXTO
                return `<ParaStyle:TEXTO>${contenido}\r`;
        }
    }



    function normalizarCaracteresCorruptos(texto) {
        const mapa = {
            "Ã¡": "á", "Ã©": "é", "Ã­": "í", "Ã³": "ó", "Ãº": "ú",
            "Ã±": "ñ", "Ã": "Á", "Ã‰": "É", "Ã": "Í", "Ã“": "Ó", "Ãš": "Ú",
            "â€œ": "“", "â€": "”", "â€˜": "‘", "â€™": "’",
            "â€“": "–", "â€”": "—", "â€¦": "…", "Â¡": "¡", "Â¿": "¿",
            "Ã¼": "ü", "Ãœ": "Ü"
        };

        return texto.replace(/Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã|Ã‰|Ã|Ã“|Ãš|â€œ|â€|â€˜|â€™|â€“|â€”|â€¦|Â¡|Â¿|Ã¼|Ãœ/g, match => mapa[match] || match);
    }




    function verificarContenidoAntesExportar() {
        const contenido = $('#textoLectura').trumbowyg('html');
        const divPrueba = document.createElement("div");
        divPrueba.innerHTML = contenido;
        
        // Verificar acentos
        const tieneAcentos = /[áéíóúÁÉÍÓÚñÑ]/.test(contenido);
        if (!tieneAcentos) console.warn("No se detectaron acentos en el texto");
        
        // Verificar estilos
        const tieneEstiloTexto = /<ParaStyle:TEXTO>/.test(convertirNodo(divPrueba));
        if (!tieneEstiloTexto) console.warn("No se detectó el estilo TEXTO en la conversión");
        
        return { tieneAcentos, tieneEstiloTexto };
    }


    function eliminarEmojis(texto) {
        // Elimina caracteres emoji (símbolos, pictogramas, etc.)
        return texto.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    }

    // Modificar la función de exportación para incluir la verificación
    function exportarLecturaComoTaggedText() {
        const contenidoHTML = $('#textoLectura').trumbowyg('html');
        if (!contenidoHTML || contenidoHTML.trim() === "") {
            alert("No hay contenido para exportar.");
            return;
        }

        const div = document.createElement("div");
        div.innerHTML = contenidoHTML;

        let taggedText = "<ASCII-MAC>\r" + eliminarEmojis(convertirNodo(div));

        // Corrige caracteres corruptos tipo "Ã¡"
        taggedText = normalizarCaracteresCorruptos(taggedText);

        // Reemplazar saltos de línea por estilo Mac
        taggedText = taggedText.replace(/\r?\n|\n/g, '\r');

        // Convertir texto a Latin1 de forma segura
        const latin1Text = unescape(encodeURIComponent(taggedText)); // convierte a ISO-8859-1
        console.log("TaggedText generado:", taggedText);

        // Crear data URL forzado a Latin1 para simular descarga
        const blob = new Blob([latin1Text], { type: "text/plain;charset=iso-8859-1" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "lectura_exportada.txt";
        a.click();

        URL.revokeObjectURL(url);
    }

    window.exportarLecturaComoTaggedText = exportarLecturaComoTaggedText;


    function exportarLecturaComoWord() {
        let contenido = $('#textoLectura').trumbowyg('html').trim();

        if (!contenido || contenido === "<p><br></p>") {
            alert("No hay contenido válido para exportar.");
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.innerHTML = contenido;

        // Limpiar: eliminar clases y scripts no válidos
        wrapper.querySelectorAll("[class]").forEach(el => el.removeAttribute("class"));
        wrapper.querySelectorAll("script, style").forEach(el => el.remove());

        // Reemplazar bloques visuales por texto simple
        wrapper.querySelectorAll(".notaMaestro, .fichaTrabajo, .anexoVisual, .recortable").forEach(el => {
            const reemplazo = document.createElement("p");
            reemplazo.textContent = el.textContent;
            el.replaceWith(reemplazo);
        });

        const cleanHTML = wrapper.innerHTML
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();

        if (!cleanHTML || cleanHTML === "") {
            alert("El contenido está vacío o no es válido para Word.");
            return;
        }

        const fullHTML = `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>Lectura Exportada</title>
            </head>
            <body>
                ${cleanHTML}
            </body>
        </html>`;

        console.log("FULL HTML generado para Word:", fullHTML);

        try {
            const blob = window.htmlDocx.asBlob(fullHTML);
            if (!blob || blob.size === 0) throw new Error("Blob vacío o incorrecto");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "lectura.docx";
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error al exportar a Word:", err);
            alert("Error al exportar a Word. Revisa la consola.");
        }
    }

    window.exportarLecturaComoWord = exportarLecturaComoWord;
        



    function aplicarEstiloSeleccion() {
        const parrafoEstilo = document.getElementById("parrafoEstiloSelect").value;
        const caracterEstilo = document.getElementById("caracterEstiloSelect").value;

        $('#textoLectura').trumbowyg('execCmd', {
            cmd: 'insertHTML',
            param: function () {
                const sel = window.getSelection();
                const range = sel.getRangeAt(0);
                const content = range.cloneContents();
                const div = document.createElement("div");
                div.appendChild(content);
                const textoSeleccionado = div.innerHTML;

                let nuevoHTML = textoSeleccionado;
                if (caracterEstilo) {
                    nuevoHTML = `<span data-charstyle="${caracterEstilo}">${nuevoHTML}</span>`;
                }
                if (parrafoEstilo) {
                    nuevoHTML = `<p data-parastyle="${parrafoEstilo}">${nuevoHTML}</p>`;
                }
                return nuevoHTML;
            }()
        });
    }


    function guardarFormularioEnLocalStorage() {
        // ⚠️ Borra todo el localStorage anterior relacionado
        localStorage.removeItem("formularioLectura");
    
        const data = {
            lecturaOriginal: document.getElementById("lecturaOriginal").innerHTML,
            temarioTexto: document.getElementById("temarioTexto").innerHTML,
            rubricaTexto: document.getElementById("rubricaTexto").innerHTML,
            genero: document.getElementById("generoSelect").value,
            tono: document.getElementById("tonoSelect").value,
            fichas: document.getElementById("checkFichas").checked,
            anexos: document.getElementById("checkAnexos").checked,
            recortables: document.getElementById("checkRecortables").checked,
            analisisHTML: document.getElementById("analisisContenido").innerHTML,
            lecturaHTML: $('#textoLectura').trumbowyg('html') || "",
            lecturaGenerada: lecturaGenerada,
            sugerencias: Array.from(document.querySelectorAll(".sugerencia-card")).map(card => card.dataset.tema)
        };
    
        // ✅ Guardar nuevamente
        localStorage.setItem("formularioLectura", JSON.stringify(data));
    }
    


    function restaurarFormularioDesdeLocalStorage() {
        const data = JSON.parse(localStorage.getItem("formularioLectura"));
        if (!data) return;
    
        document.getElementById("lecturaOriginal").innerHTML = data.lecturaOriginal || "";
        document.getElementById("temarioTexto").innerHTML = data.temarioTexto || "";
        document.getElementById("rubricaTexto").innerHTML = data.rubricaTexto || "";
    
        document.getElementById("generoSelect").value = data.genero || "";
        document.getElementById("tonoSelect").value = data.tono || "";
        document.getElementById("nivelSelect").value = data.nivel || "";
    
        if (data.nivel && gradosPorNivel[data.nivel]) {
            const gradoSelect = document.getElementById("gradoSelect");
            gradoSelect.innerHTML = '<option value="">-- Selecciona un grado --</option>';
            gradosPorNivel[data.nivel].forEach(grado => {
                const opt = document.createElement("option");
                opt.value = grado;
                opt.textContent = grado;
                gradoSelect.appendChild(opt);
            });
            document.getElementById("gradoSelect").value = data.grado || "";
        }
    
        document.getElementById("checkFichas").checked = !!data.fichas;
        document.getElementById("checkAnexos").checked = !!data.anexos;
        document.getElementById("checkRecortables").checked = !!data.recortables;
    
        if (data.analisisHTML) {
            document.getElementById("analisisContenido").innerHTML = data.analisisHTML;
        
            const resultado = document.getElementById("analisisResultado");
            if (resultado) resultado.style.display = "block";
        
            const continuarBtn = document.getElementById("continuarAnalisisBtn");
            if (continuarBtn) continuarBtn.style.display = "inline-block";
        }
        
    
        if (data.lecturaHTML) {
            $('#textoLectura').trumbowyg('html', data.lecturaHTML);
            document.getElementById("editorLectura").style.display = "block";
        }
    
        if (data.sugerencias && Array.isArray(data.sugerencias)) {
            renderizarSugerencias(data.sugerencias);
        }
        
        if (data.lecturaGenerada) {
            lecturaGenerada = data.lecturaGenerada;
        }
    }

    window.addEventListener("load", () => {
        restaurarFormularioDesdeLocalStorage();
        iniciarAutoGuardadoFormulario();
    });
    

    function iniciarAutoGuardadoFormulario() {
        const campos = [
            "lecturaOriginal", "temarioTexto", "rubricaTexto",
            "generoSelect", "tonoSelect", "nivelSelect", "gradoSelect",
            "checkFichas", "checkAnexos", "checkRecortables"
        ];

        campos.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const evento = el.tagName === "DIV" ? "input" : "change";
                el.addEventListener(evento, guardarFormularioEnLocalStorage);
            }
        });
    }


    document.addEventListener("DOMContentLoaded", () => {
        restaurarFormularioDesdeLocalStorage();
        iniciarAutoGuardadoFormulario();

        // 👉 Forzar color negro al pegar en lecturaOriginal, temarioTexto, rubricaTexto
        ["lecturaOriginal", "temarioTexto", "rubricaTexto"].forEach(id => {
            const div = document.getElementById(id);
            div.addEventListener("paste", (e) => {
                e.preventDefault();

                const text = (e.clipboardData || window.clipboardData).getData("text/html") || 
                            (e.clipboardData || window.clipboardData).getData("text/plain");

                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = text;

                tempDiv.querySelectorAll("*").forEach(el => {
                    el.style.color = "black"; // Forzar color negro
                    el.removeAttribute("color"); // Remueve atributos heredados
                });

                document.execCommand("insertHTML", false, tempDiv.innerHTML);
            });
        });
    });


    document.addEventListener("DOMContentLoaded", () => {
        const btnAbrir = document.getElementById("abrirUnidadBtn");
        const modal    = document.getElementById("modalUnidad");
        const cerrar   = document.querySelector(".close-modal-unidad");
        const cont     = document.getElementById("unidad-contenido");
        const db       = getFirestore();
      
        const params   = new URLSearchParams(window.location.search);
        const unidadId = params.get("unidadId");
      
        const cargarInfoUnidad = async () => {
          if (!unidadId) {
            cont.innerHTML = `<p>No se especificó la unidad.</p>`;
            return;
          }
      
          try {
            const snap = await getDoc(doc(db, "Unidades", unidadId));
            if (!snap.exists()) {
              cont.innerHTML = `<p>Unidad no encontrada.</p>`;
              return;
            }
      
            const u = snap.data();
            cont.innerHTML = `
            <div class="unidad-info-grid">
              <div class="info-block">
                <label>Nombre de la unidad:</label>
                <div contenteditable="true" id="mod-nombreUnidad" class="editable">${u.nombreUnidad || ''}</div>
              </div>
          
              <div class="info-block">
                <label>Materia:</label>
                <div contenteditable="true" id="mod-materia" class="editable">${u.materia || ''}</div>
              </div>
          
              <div class="info-row">
                <div class="info-block">
                  <label>Nivel:</label>
                  <div contenteditable="true" id="mod-nivel" class="editable">${u.nivel || '-'}</div>
                </div>
          
                <div class="info-block">
                  <label>Grado:</label>
                  <div contenteditable="true" id="mod-grado" class="editable">${u.grado || '-'}</div>
                </div>
          
                <div class="info-block">
                  <label>Unidad:</label>
                  <input type="number" id="mod-unidad" class="input-numero" value="${u.unidad || ''}" />
                </div>
              </div>
          
              <div class="info-row">
                <div class="info-block">
                  <label>Trimestre:</label>
                  <input type="number" id="mod-trimestre" class="input-numero" value="${u.trimestre || ''}" />
                </div>
          
                <div class="info-block">
                  <label>Privacidad:</label>
                  <select id="mod-privacidad" class="input-select">
                    <option value="Privado" ${u.privacidad === "Privado" ? "selected" : ""}>Privado</option>
                    <option value="Público" ${u.privacidad === "Público" ? "selected" : ""}>Público</option>
                  </select>
                </div>
              </div>
          
              <div class="info-block">
                <label>Creado el:</label>
                <p>${u.createdAt?.toDate().toLocaleDateString() || "-"}</p>
              </div>
            </div>
          `;
                          
            // Guardar nombreUnidad
            document.getElementById("mod-nombreUnidad").addEventListener("blur", async e => {
              const txt = e.target.textContent.replace(/^Nombre de la unidad:\s*/, "").trim();
              await updateDoc(doc(db, "Unidades", unidadId), { nombreUnidad: txt });
            });
      
            // Guardar materia
            document.getElementById("mod-materia").addEventListener("blur", async e => {
              const txt = e.target.textContent.replace(/^Materia:\s*/, "").trim();
              await updateDoc(doc(db, "Unidades", unidadId), { materia: txt });
            });
      
            document.getElementById("mod-nivel").addEventListener("blur", async e => {
                await updateDoc(doc(db, "Unidades", unidadId), { nivel: e.target.textContent.trim() });
            });

            // Guardar grado
            document.getElementById("mod-grado").addEventListener("blur", async e => {
                await updateDoc(doc(db, "Unidades", unidadId), { grado: e.target.textContent.trim() });
            });

            // Guardar unidad
            document.getElementById("mod-unidad").addEventListener("change", async e => {
                const valor = parseInt(e.target.value);
                if (!isNaN(valor)) {
                    await updateDoc(doc(db, "Unidades", unidadId), { unidad: valor });
                }
            });



            // Guardar trimestre
            document.getElementById("mod-trimestre").addEventListener("change", async e => {
              const valor = parseInt(e.target.value);
              if (!isNaN(valor)) {
                await updateDoc(doc(db, "Unidades", unidadId), { trimestre: valor });
              }
            });
      
            // Guardar privacidad
            document.getElementById("mod-privacidad").addEventListener("change", async e => {
              const valor = e.target.value;
              await updateDoc(doc(db, "Unidades", unidadId), { privacidad: valor });
            });
      
          } catch (err) {
            console.error("Error al cargar unidad:", err);
            cont.innerHTML = `<p>Error cargando datos.</p>`;
          }
        };
      
        // Mostrar modal y cargar datos
        if (btnAbrir && modal && cerrar) {
          btnAbrir.addEventListener("click", async () => {
            await cargarInfoUnidad(); // ✅ Cargar antes de mostrar
            modal.style.display = "block";
          });
      
          cerrar.addEventListener("click", () => {
            modal.style.display = "none";
          });
      
          window.addEventListener("click", e => {
            if (e.target === modal) {
              modal.style.display = "none";
            }
          });
        }
      });
          




    document.addEventListener("DOMContentLoaded", () => {
    insertarGeneradorImagenes("#generadorImagenesContainer");
    });



    document.getElementById("modalTitulo").addEventListener("blur", async (e) => {
        const nuevoTitulo = e.target.textContent.trim();
        const docId = $('#modalEditor').data('docId');

        if (!docId || !nuevoTitulo) return;

        try {
        const docRef = doc(db, "lecturas", docId);
        await updateDoc(docRef, { tema: nuevoTitulo, updatedAt: new Date() });

        // Recargar lista de lecturas para reflejar el nuevo título
        await cargarLecturas();
        } catch (error) {
        console.error("Error al actualizar título:", error);
        mostrarError("No se pudo actualizar el título.");
        }
    });

    

    document.addEventListener("DOMContentLoaded", () => {
        const analisisLecturaNueva = document.getElementById("analisisLecturaNueva");
        const modalNivelGrado = document.getElementById("modalNivelGrado");
        const modalNivelSelect = document.getElementById("modalNivelSelect");
        const modalGradoSelect = document.getElementById("modalGradoSelect");
        const materiaSelect = document.getElementById("materiaSelect");
        const competenciasSelect = document.getElementById("competenciasSelect");
        const materiasContainer = document.getElementById("materiaContainer");
        const competenciasContainer = document.getElementById("competenciasContainer");
      
        const materiasPrimaria = ["selecciona una materia", "Español", "Inglés", "Matemáticas"];
        const materiasSecundaria = ["Selecciona una materia", "Español", "Matemáticas", "Biología", "Geografía", "Física", "Educación cívica y ética", "Química", "Historia del mundo", "Historia de México", "Inglés"];
      
        const competenciasPrimariaBaja = ["Todos", "Convenciones lingüísticas (ortografía)", "Convenciones lingüísticas (gramática)", "Expresión escrita", "Trazos y letras", "Comprensión lectora", "Expresión oral", "Educación socioemocional", "Conocimiento del medio", "Formación cívica y ética", "Habilidades", "MINDMAP", "Matemáticas"];
        const competenciasPrimariaAlta = ["Todos", "Convenciones lingüísticas (Ortografía)", "Convenciones lingüísticas (Gramática)", "Expresión escrita:", "Expresión oral", "Educación socioemocional", "Ciencias Naturales", "Historia", "Geografía", "Formación Cívica y Ética", "Habilidades", "Dictado", "MINDMAP", "Matemáticas"];
        const competenciasPrimariaIngles = ["Todos", "Reading", "Vocabulary", "Say It Right", "Mind Map", "Reading Comprehension", "Vocabulary and Spelling", "Write It Right", "Language Arts", "Grammar", "Let's play", "Fun, fun, fun", "Sing Along", "Listening Comprehension", "Reading 2", "Let's Draw It", "Grammar Review", "Real Case", "I Can Write", "English at the Playground", "Math Point", "Now I Know!"];
        const competenciasSecundaria = ["Todos", "Objetivos", "Conocimientos Previos", "Lectura", "Preguntas de comprensión", "1ra Estación", "2da Estación", "3ra Estación", "4ta Estación", "Fuentes Bibliográficas"];
      
        analisisLecturaNueva.addEventListener("click", () => {
          modalNivelGrado.style.display = "block";
        });
      
        modalNivelSelect.addEventListener("change", () => {
          const nivel = modalNivelSelect.value;
      
          // Limpiar grados y materias
          modalGradoSelect.innerHTML = '<option value="">-- Selecciona un grado --</option>';
          materiaSelect.innerHTML = '';
          competenciasSelect.innerHTML = '';
          competenciasContainer.style.display = "none";
      
          if (nivel === "Primaria") {
            ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"].forEach(grado => {
              const opt = document.createElement("option");
              opt.value = grado;
              opt.textContent = grado;
              modalGradoSelect.appendChild(opt);
            });
            materiasPrimaria.forEach(m => materiaSelect.append(new Option(m, m)));
            materiasContainer.style.display = "block";
          } else if (nivel === "Secundaria") {
            ["Primero", "Segundo", "Tercero"].forEach(grado => {
              const opt = document.createElement("option");
              opt.value = grado;
              opt.textContent = grado;
              modalGradoSelect.appendChild(opt);
            });
            materiasSecundaria.forEach(m => materiaSelect.append(new Option(m, m)));
            materiasContainer.style.display = "block";
          } else {
            materiasContainer.style.display = "none";
          }
        });
      
        materiaSelect.addEventListener("change", () => {
          const nivel = modalNivelSelect.value;
          const grado = modalGradoSelect.value;
          const materia = materiaSelect.value;
      
          competenciasSelect.innerHTML = "";
      
          if (nivel === "Primaria") {
            if (materia === "Español") {
              const competencias = ["Primero", "Segundo", "Tercero"].includes(grado)
                ? competenciasPrimariaBaja
                : competenciasPrimariaAlta;
              competencias.forEach(c => competenciasSelect.append(new Option(c, c)));
            } else if (materia === "Inglés") {
              competenciasPrimariaIngles.forEach(c => competenciasSelect.append(new Option(c, c)));
            } else if (materia === "Matemáticas") {
              competenciasPrimariaAlta
                .filter(c => c === "Todos" || c === "Matemáticas")
                .forEach(c => competenciasSelect.append(new Option(c, c)));
            }
          } else if (nivel === "Secundaria") {
            competenciasSecundaria.forEach(c => competenciasSelect.append(new Option(c, c)));
          }
      
          competenciasContainer.style.display = "block";
        });
   
      


    document.getElementById("cerrarModalNivelGrado").addEventListener("click", () => {
        modalNivelGrado.style.display = "none";
    });

    document.getElementById("formNivelGrado").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nivel = modalNivelSelect.value;
        const grado = modalGradoSelect.value;
        materiasSeleccionadas = Array.from(materiaSelect.selectedOptions).map(opt => opt.value);
    
        if (!nivel || !grado) {
            alert("Por favor selecciona nivel y grado");
            return;
        }
    
        modalNivelGrado.style.display = "none";
        await generarLecturaOriginal(nivel, grado, materiasSeleccionadas);
    });
    

// Botón para continuar la lectura original
const btnContinuarLectura = document.getElementById("continuarGeneracionBtnLectura");

btnContinuarLectura?.addEventListener("click", async () => {
    btnContinuarLectura.disabled = true;
    btnContinuarLectura.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Continuando...';

    try {
        await continuarAnalisis(textoAcumuladoGlobal, nivelSeleccionadoGlobal, gradoSeleccionadoGlobal, temaSeleccionadoGlobal);
    } catch (err) {
        console.error("❌ Error al continuar análisis:", err);
    } finally {
        btnContinuarLectura.disabled = false;
        btnContinuarLectura.innerHTML = "➡️ Continuar Generando Lectura";
    }
});



// 📌 Event listener para el botón "Continuar Generando"
document.getElementById("continuarGeneracionBtnLectura").addEventListener("click", async () => {
    await continuarAnalisis(textoAcumuladoGlobal, nivelSeleccionadoGlobal, gradoSeleccionadoGlobal, temaSeleccionadoGlobal);
});

async function generarLecturaOriginal(nivelSeleccionado, gradoSeleccionado, materiasSeleccionada) {
    const temaEspecifico = document.getElementById("temaInput2").value.trim();
    const generarBtn = document.getElementById("analisisLecturaNueva");
    generarBtn.disabled = true;
    generarBtn.innerHTML = '<i class="bx bx-loader bx-spin"></i> Generando...';

    try {
        const prompt = `
Eres un AUTOR-EDITOR PEDAGÓGICO profesional en México.
Crea exclusivamente un ANÁLISIS EDUCATIVO estructurado en HTML sobre el tema **"${temaEspecifico}"**, para estudiantes de **${nivelSeleccionado}, grado ${gradoSeleccionado}**.

⚡️ Instrucciones:
- NO incluyas sugerencias de lectura.
- SOLO incluye análisis pedagógico.
- Usa etiquetas HTML (<h2>, <p>, <ul>, <li>, etc.).
- No pongas emojis.
- No escribas comentarios de IA.
    
IMPORTANTE añadir esta nota con dentro de un div con el estilo class="alertaIA" en cada Competencia: ⚠️ Es IMPORTANTE Revisar todo el contenido generado con la IA.

📋 FORMATO HTML SOLICITADO:
- <h2>📌 TEMA PRINCIPAL</h2> <p>[Desarrollo breve]</p>
- <h2>🔍 ÁREAS DE MEJORA</h2> <ul><li>...</li></ul>
- <h2>📋 HABILIDADES EVALUADAS</h2> <ul><li>...</li></ul>
- <h2>📋 NUEVA SECUENCIA Y ALCANCE A PARTIR DEL DOCUMENTO</h2> <table><tr>...</tr></table>
`;

        const body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2000
            }
        };

        const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!rawText) {
            mostrarError("La respuesta fue demasiado corta. Intenta de nuevo.");
        } else {
            procesarRespuestaGemini(rawText);
            textoAcumuladoGlobal = rawText;
            nivelSeleccionadoGlobal = nivelSeleccionado;
            gradoSeleccionadoGlobal = gradoSeleccionado;
            temaSeleccionadoGlobal = temaEspecifico;
        }
    } catch (err) {
        console.error("Error al generar análisis:", err);
        mostrarError(`Error al generar análisis: ${err.message}`);
    } finally {
        generarBtn.disabled = false;
        generarBtn.innerHTML = '<i class="fas fa-file-alt"></i> Generar Análisis';
    }
}

    
      
document.getElementById("generarSugerenciasBtn").addEventListener("click", async () => {
    temaSeleccionadoGlobal = document.getElementById("temaInput2")?.value?.trim() || temaSeleccionadoGlobal;
    nivelSeleccionadoGlobal = document.getElementById("nivelSelect")?.value || nivelSeleccionadoGlobal;
    gradoSeleccionadoGlobal = document.getElementById("gradoSelect")?.value || gradoSeleccionadoGlobal;

    // ✅ Sincronizar desde el formulario actual
    const temaEspecifico = document.getElementById("temaInput2")?.value?.trim();
    const nivel = document.getElementById("nivelSelect")?.value;
    const grado = document.getElementById("gradoSelect")?.value;


    // ✅ Asignar a variables globales
    temaSeleccionadoGlobal = temaEspecifico;
    nivelSeleccionadoGlobal = nivel;
    gradoSeleccionadoGlobal = grado;

    // ✅ Verificar si el análisis está en memoria o cargar desde localStorage
    if (!textoAcumuladoGlobal) {
        const guardado = localStorage.getItem("textoAnalisisLectura");
        if (guardado) {
            textoAcumuladoGlobal = guardado;
            console.log("📥 Análisis cargado desde localStorage.");
        } else {
            alert("⚠️ Primero debes generar el análisis antes de sugerir lecturas.");
            return;
        }
    }

    // 🔁 Si está cortado, continuar
    if (esRespuestaCortadaPorTokens(textoAcumuladoGlobal)) {
        console.warn("⚠️ La respuesta está incompleta. Continuando automáticamente...");
        await continuarAnalisis(textoAcumuladoGlobal, nivel, grado, temaEspecifico);
    }

    const sugerenciasBtn = document.getElementById("generarSugerenciasBtn");
    sugerenciasBtn.disabled = true;
    sugerenciasBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando sugerencias...';

    try {
        const prompt = `
Eres un AUTOR-EDITOR PEDAGÓGICO especializado.
Basándote en el tema "${temaEspecifico}", la Metodología ASC, y el siguiente análisis:

${textoAcumuladoGlobal}

💡 Genera exactamente 10 sugerencias de lectura nuevas:
- 5 inventadas (cuentos, ensayos, artículos)
- 5 basadas en libros/artículos sin derechos de autor
- Cada sugerencia debe tener un título + una breve descripción.

⚡️ FORMATO HTML ESTRICTO:
<h2>💡 SUGERENCIAS DE LECTURA</h2>
<ol>
    <li class="sugerencia-card"><strong>[Título 1]:</strong> [Descripción breve]</li>
    <li class="sugerencia-card"><strong>[Título 2]:</strong> [Descripción breve]</li>
    ...
</ol>

❗ No incluyas análisis, no repitas el tema.
❗ No pongas emojis ni comentarios de IA.
❗ Asegúrate de que cada sugerencia sea clara, útil y alineada al tema "${temaEspecifico}" para ${nivel} ${grado}.
`;

        const body = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.4,
                topP: 0.9,
                topK: 50,
                maxOutputTokens: 1500
            }
        };

        const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!rawText) {
            mostrarError("No se generaron sugerencias.");
            return;
        }

        const sugerencias = extraerSugerencias(rawText);
        renderizarSugerencias(sugerencias);

    } catch (err) {
        console.error("❌ Error al generar sugerencias:", err);
        mostrarError("Error al generar sugerencias: " + err.message);
    } finally {
        sugerenciasBtn.disabled = false;
        sugerenciasBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Generar Sugerencias de Lectura';
    }
});


    
    
    async function continuarAnalisis(rawTextAcumulado, nivelSeleccionado, gradoSeleccionado, seleccionTema) {
        console.log("🧠 Iniciando continuación del análisis...");
    
        const ultimaSeccion = detectarSeccionFinal(rawTextAcumulado);
        console.log("🧩 Última sección detectada:", ultimaSeccion);
    
        let promptContinuacion = "";
    
        if (ultimaSeccion === "sugerenciasLecturaIncompletas") {
            promptContinuacion = `
    Continúa generando las "SUGERENCIAS DE LECTURA" para completar las 10 sugerencias en el mismo formato de lista HTML.
    
    Aagregar los elementos que faltan, empezando desde donde se quedó.
    
    <ol>
        <li class="sugerencia-card">7. ...</li>
        <li class="sugerencia-card">8. ...</li>
        <li class="sugerencia-card">9. ...</li>
        <li class="sugerencia-card">10. ...</li>
    </ol>
    
    ⚠️ No repetir sugerencias anteriores, no comenzar desde 1.
            `;
        } else {
            promptContinuacion = `
    Continúa desarrollando el contenido pedagógico relacionado con el tema "${seleccionTema}" para el nivel "${nivelSeleccionado}" y grado "${gradoSeleccionado}".
        
    ⚠️ IMPORTANTE: No reiniciar contenido anterior ni reescribirlo.
            `;
        }
    
        const body = {
            contents: [{
                parts: [{ text: promptContinuacion }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000
            }
        };
    
        try {
            const response = await fetch(`${googleAPIEndpoint}?key=${googleAPIKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
    
            const data = await response.json();
            const nuevoTexto = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
            if (!nuevoTexto) {
                console.warn("⚠️ No se recibió texto al continuar análisis.");
                return;
            }

            textoAcumuladoGlobal += "\n" + nuevoTexto;

            if (esRespuestaCortadaPorTokens(nuevoTexto)) {
                document.getElementById("botonContinuarLecturaContainer").style.display = "block";
            } else {
                document.getElementById("botonContinuarLecturaContainer").style.display = "none";
            }
    
            console.log("✅ Continuación recibida:");
            console.log(nuevoTexto);
    
            // ⬇️ Aquí aseguramos que sí procese sugerencias extra si vienen en la continuación
            procesarRespuestaGemini(nuevoTexto, true);
    
            const sugerenciasExtra = extraerSugerencias(nuevoTexto);
            if (sugerenciasExtra.length > 0) {
                console.log("✅ Sugerencias adicionales extraídas:", sugerenciasExtra);
                renderizarSugerencias(sugerenciasExtra);
            }
    
            guardarFormularioEnLocalStorage();
        } catch (error) {
            console.error("❌ Error al continuar análisis:", error);
        }
    }
    
    function detectarSeccionFinal(texto) {
        if (texto.includes("<h2>💡 SUGERENCIAS DE LECTURA</h2>")) {
            const sugerencias = texto.match(/<li class="sugerencia-card">/g);
            if (sugerencias && sugerencias.length < 10) return "sugerenciasLecturaIncompletas";
            return "fin"; // ya estaban completas
        }
        if (texto.includes("📋 NUEVA SECUENCIA Y ALCANCE")) return "secuencia";
        if (texto.includes("📋 HABILIDADES EVALUADAS")) return "habilidades";
        if (texto.includes("🔍 ÁREAS DE MEJORA")) return "areasMejora";
        if (texto.includes("✅ ASPECTOS POSITIVOS")) return "positivos";
        if (texto.includes("📌 TEMA PRINCIPAL")) return "tema";
        return "desconocido";
    }
              
});







function hacerArrastrable(elemento) {
    let offsetX = 0, offsetY = 0, startX = 0, startY = 0;
    let activo = false;
  
    // Eventos para mouse
    elemento.addEventListener('mousedown', iniciarArrastre);
    document.addEventListener('mousemove', moverElemento);
    document.addEventListener('mouseup', finalizarArrastre);
  
    // Eventos para táctil
    elemento.addEventListener('touchstart', iniciarArrastre);
    document.addEventListener('touchmove', moverElemento);
    document.addEventListener('touchend', finalizarArrastre);
  
    function iniciarArrastre(e) {
      activo = true;
      const evento = e.touches ? e.touches[0] : e;
      startX = evento.clientX;
      startY = evento.clientY;
  
      const rect = elemento.getBoundingClientRect();
      offsetX = startX - rect.left;
      offsetY = startY - rect.top;
  
      elemento.style.cursor = "grabbing";
      e.preventDefault();
    }
  
    function moverElemento(e) {
      if (!activo) return;
      const evento = e.touches ? e.touches[0] : e;
  
      let x = evento.clientX - offsetX;
      let y = evento.clientY - offsetY;
  
      // Limitar dentro de la ventana
      const maxX = window.innerWidth - elemento.offsetWidth;
      const maxY = window.innerHeight - elemento.offsetHeight;
  
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
  
      elemento.style.left = x + 'px';
      elemento.style.top = y + 'px';
    }
  
    function finalizarArrastre() {
      activo = false;
      elemento.style.cursor = "grab";
    }
  }
  
  // Activar arrastre para tu burbuja
  document.addEventListener('DOMContentLoaded', () => {
    const bubble = document.getElementById('chatbotBubble');
    hacerArrastrable(bubble);
  });
  


  // Mostrar u ocultar el generador
const botonAbrirGenerador = document.getElementById("btnAbrirGeneradorImagenes");
const contenedor = document.getElementById("contenedorGeneradorImagenes");
const cerrarGenerador = document.getElementById("cerrarGeneradorImagenes");
const containerInterno = document.getElementById("generadorImagenesContainer");

botonAbrirGenerador.addEventListener("click", async () => {
  if (containerInterno.innerHTML.trim() === "") {
    // Cargar contenido del archivo generarImagen.html
    try {
      const res = await fetch("generarImagen.html");
      const html = await res.text();
      // Insertar solo el contenido del <body>, no el <head>
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      containerInterno.innerHTML = bodyMatch ? bodyMatch[1] : html;
      // Ejecutar scripts manualmente si es necesario
      const scripts = containerInterno.querySelectorAll("script");
      for (let script of scripts) {
        const newScript = document.createElement("script");
        newScript.type = script.type || "text/javascript";
        if (script.src) {
          newScript.src = script.src;
        } else {
          newScript.textContent = script.textContent;
        }
        document.body.appendChild(newScript);
      }
    } catch (e) {
      console.error("❌ Error al cargar el generador de imágenes:", e);
    }
  }

  contenedor.style.display = "block";
});

cerrarGenerador.addEventListener("click", () => {
  contenedor.style.display = "none";
});


document.addEventListener("DOMContentLoaded", () => {
  const btnAbrirGenerador = document.getElementById("btnAbrirGenerador");
  const modalGenerador = new bootstrap.Modal(document.getElementById("modalGeneradorLecturas"));
  const cerrarGenerador = document.getElementById("cerrarGeneradorLecturas");

  if (btnAbrirGenerador) {
    btnAbrirGenerador.addEventListener("click", () => {
      modalGenerador.show();  // Abre el modal usando Bootstrap
    });
  }

  if (cerrarGenerador) {
    cerrarGenerador.addEventListener("click", () => {
      modalGenerador.hide();  // Cierra el modal usando Bootstrap
    });
  }

});


document.getElementById("cerrarModalBtnTop").addEventListener("click", () => {
document.getElementById("lecturaModal").style.display = "none";
});
  

document.addEventListener("DOMContentLoaded", () => {
    const nivelSelect = document.getElementById("modalNivelSelect");
    const gradoSelect = document.getElementById("modalGradoSelect");
    const materiaSelect = document.getElementById("materiaSelect");
    const competenciasSelect = document.getElementById("competenciasSelect");
    const competenciasContainer = document.getElementById("competenciasContainer");
  
    const materiasPorNivel = {
      "Primaria": ["Seleccione una materia", "Español", "Inglés", "Matemáticas"],
      "Secundaria": ["Seleccione una materia", "Español", "Matemáticas", "Biología", "Geografía", "Física", "Educación cívica y ética", "Química", "Historia del mundo", "Historia de México", "Inglés"]
    };
  
    const competenciasPrimariaBaja = ["Todos", "Comprensión lectora", "Expresión oral", "Expresión escrita", "Trazos y letras", "Educación socioemocional", "Matemáticas"];
    const competenciasPrimariaAlta = ["Todos", "Ortografía", "Gramática", "Expresión escrita", "Expresión oral", "Educación socioemocional", "Ciencias Naturales", "Formación Cívica y Ética", "Historia", "Geografía", "Matemáticas"];
    const competenciasPrimariaIngles = ["Todos", "Reading", "Vocabulary", "Say It Right", "Mind Map", "Write It Right", "Listening Comprehension"];
    const competenciasSecundaria = ["Todos", "Objetivos", "Conocimientos Previos", "Lectura", "Preguntas de comprensión", "1ra Estación", "2da Estación", "3ra Estación", "4ta Estación", "Fuentes Bibliográficas"];
  
    nivelSelect.addEventListener("change", () => {
      const nivel = nivelSelect.value;
  
      // Limpiar grados y materias
      gradoSelect.innerHTML = '<option value="">-- Selecciona un grado --</option>';
      materiaSelect.innerHTML = '';
      competenciasSelect.innerHTML = '';
      competenciasContainer.style.display = "none";
  
      if (nivel === "Primaria") {
        ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"].forEach(grado => {
          const opt = document.createElement("option");
          opt.value = grado;
          opt.textContent = grado;
          gradoSelect.appendChild(opt);
        });
  
        materiasPorNivel["Primaria"].forEach(m => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m;
          materiaSelect.appendChild(opt);
        });
  
      } else if (nivel === "Secundaria") {
        ["Primero", "Segundo", "Tercero"].forEach(grado => {
          const opt = document.createElement("option");
          opt.value = grado;
          opt.textContent = grado;
          gradoSelect.appendChild(opt);
        });
  
        materiasPorNivel["Secundaria"].forEach(m => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m;
          materiaSelect.appendChild(opt);
        });
      }
    });
  
    materiaSelect.addEventListener("change", () => {
      const nivel = nivelSelect.value;
      const grado = gradoSelect.value;
      const materia = materiaSelect.value;
  
      competenciasSelect.innerHTML = "";
  
      if (nivel === "Primaria") {
        if (materia === "Español") {
          const competencias = ["Primero", "Segundo", "Tercero"].includes(grado)
            ? competenciasPrimariaBaja
            : competenciasPrimariaAlta;
          competencias.forEach(c => competenciasSelect.append(new Option(c, c)));
        } else if (materia === "Inglés") {
          competenciasPrimariaIngles.forEach(c => competenciasSelect.append(new Option(c, c)));
        } else if (materia === "Matemáticas") {
          competenciasPrimariaAlta
            .filter(c => c === "Todos" || c === "Matemáticas")
            .forEach(c => competenciasSelect.append(new Option(c, c)));
        }
      } else if (nivel === "Secundaria") {
        competenciasSecundaria.forEach(c => competenciasSelect.append(new Option(c, c)));
      }
  
      competenciasContainer.style.display = "block";
    });
  });
  


  const configurarBuscador = () => {
    const input = document.getElementById("searchInput");
    const filtroNivel = document.getElementById("filtroNivel");
    const filtroGrado = document.getElementById("filtroGrado");
    const filtroTrimestre = document.getElementById("filtroTrimestre");
    const filtroUnidad = document.getElementById("filtroUnidad");
  
    const contenedor = document.getElementById("app-container-contenido-unidad");
  
    const aplicarFiltros = () => {
        const texto = input?.value.toLowerCase().trim() || "";
        const nivel = filtroNivel?.value.toLowerCase() || "";
        const grado = filtroGrado?.value.toLowerCase() || "";
        const trimestre = filtroTrimestre?.value || "";
        const unidad = filtroUnidad?.value || "";
      
        const tarjetas = document.querySelectorAll(".lectura-card, .unidad-item, .searchable-item");
        let hayResultados = false;
      
        tarjetas.forEach((t) => {
          const contenido = t.innerText.toLowerCase();
      
          const visible =
            contenido.includes(texto) &&
            (nivel === "" || contenido.includes(nivel)) &&
            (grado === "" || contenido.includes(grado)) &&
            (trimestre === "" || contenido.includes(`trimestre ${trimestre}`)) &&
            (unidad === "" || contenido.includes(`unidad ${unidad}`));
      
          t.style.display = visible ? "block" : "none";
          if (visible) hayResultados = true;
        });
      
        let msg = document.getElementById("no-results-msg");
        if (!hayResultados && texto) {
          if (!msg) {
            msg = document.createElement("p");
            msg.id = "no-results-msg";
            msg.textContent = "No se encontraron resultados.";
            contenedor.appendChild(msg);
          }
        } else if (msg) {
          msg.remove();
        }
      };
      
  
    [input, filtroNivel, filtroGrado, filtroTrimestre, filtroUnidad].forEach((el) => {
      if (el && typeof el.addEventListener === "function") {
        el.addEventListener("input", aplicarFiltros);
        el.addEventListener("change", aplicarFiltros); // también para selects
      }
    });
  };
  
  document.getElementById("searchInput").addEventListener("input", function () {
    const valor = this.value.toLowerCase();
    document.querySelectorAll(".lectura-card").forEach(card => {
        const texto = card.innerText.toLowerCase();
        card.style.display = texto.includes(valor) ? "flex" : "none";
    });
});


document.getElementById("btnReiniciarFiltros")?.addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
  
    // Reiniciar selects uno por uno
    const selects = ["filtroNivel", "filtroGrado", "filtroTrimestre", "filtroUnidad"];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = "";
        $(`#${id}`).selectpicker('refresh'); // Asegura que el cambio se refleje
      }
    });
  
    // Re-disparar eventos para que se apliquen filtros otra vez
    const eventoInput = new Event('input');
    const eventoChange = new Event('change');
    document.getElementById("searchInput").dispatchEvent(eventoInput);
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.dispatchEvent(eventoChange);
    });
  });
    

  configurarBuscador();



function bindModalNivelGrado() {
  const nivel = document.getElementById("modalNivelSelect");
  const grado = document.getElementById("modalGradoSelect");

  if (!nivel || !grado) return;   // aún no está en el DOM

  nivel.addEventListener("change", () => {
    grado.innerHTML = '<option value="">-- Selecciona un grado --</option>';
    const lista = (nivel.value === "Primaria")
      ? ["Primero","Segundo","Tercero","Cuarto","Quinto","Sexto"]
      : (nivel.value === "Secundaria")
        ? ["Primero","Segundo","Tercero"]
        : [];

    lista.forEach(g => {
      const o = document.createElement("option");
      o.value = g; o.textContent = g;
      grado.appendChild(o);
    });
  });
}
