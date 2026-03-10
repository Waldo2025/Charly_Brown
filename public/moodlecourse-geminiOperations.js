import { obtenerModulo, guardarModulo } from "./moodleCourse.js";


const API_KEY = "__GEMINI_API_KEY_LOCAL__"; // ¡Recuerda proteger tu clave!

function getGeminiEndpoint() {
  // Asegúrate de que el valor del select sea un nombre de modelo válido
  const modelo = document.getElementById("selectGeminiEndpoint")?.value 
      || "gemini-1.5-flash"; // Nombre de modelo por defecto válido

  // La URL del endpoint es correcta para la API REST de Google GenAI
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;
}

function extraerPartesMultimodalesDesdeInstrucciones(instruccionesHtml = "") {
  const raw = String(instruccionesHtml || "");
  const images = [];
  let textOnly = raw;

  // Extraer imágenes en data URL para enviarlas como inline_data a Gemini.
  const regexDataImg = /<img[^>]+src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+)["'][^>]*>/gi;
  textOnly = textOnly.replace(regexDataImg, (match, dataUrl) => {
    const dataUrlStr = String(dataUrl || "");
    const m = dataUrlStr.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m && m[1] && m[2]) {
      images.push({
        mimeType: m[1],
        data: m[2]
      });
    }
    return "";
  });

  // Eliminar resto de tags no textuales para análisis de instrucciones.
  textOnly = textOnly
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { textOnly, images };
}




/* BLOQUE DE HTML SIMPLE PARA GEMINI */
const BLOQUE_FORMATO_MOODLE = `
=== FORMATO HTML OBLIGATORIO ===

- NO usar <div>, <section>, <article>, <header>, <footer>, ni estilos externos.
- <span> SOLO se permite si contiene style="color:green" o style="color:red".
- NO usar markdown, no usar backticks.
- ✅ SE PERMITEN TABLAS (<table>, <tr>, <th>, <td>) cuando sea apropiado para organizar información.
- SOLO usar: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <tr>, <th>, <td>, <span> (solo para retroalimentación en Quizz). AÑADIR MARGIN-BOTTOM A TODAS LAS ETIQUETAS
- Para Quizz: tablas SOLO para preguntas de emparejamiento.
- Para Página: tablas permitidas para organizar contenido cuando sea necesario.
- Retroalimentaciones (solo en Quizz):
    ✓ Correcta: <span style="color:green;">texto</span>
    ✓ Incorrecta: <span style="color:red;">texto</span>

- Mantener estructura limpia y legible.
`;

const BLOQUE_FORMATO_MARKDOWN = `
=== FORMATO MARKDOWN ESTRUCTURADO (OBLIGATORIO) ===

- Responde SOLO en markdown (sin HTML, sin etiquetas <...>).
- Usa encabezados jerárquicos con #, ##, ###.
- Usa listas con "-", "*" u "1." cuando aplique.
- Usa **negritas** para conceptos clave.
- Si se requiere comparación o matriz, usa tablas markdown:
  | Columna | Columna |
  |---|---|
  | Valor | Valor |
- No uses bloques de código \`\`\` salvo que el autor los pida explícitamente.
- No agregues comentarios meta ni explicaciones fuera del contenido.
`;



let temaActivo = null;
let subtemaActivo = null;

const LANGUAGE_PROFILES = [
    {
        code: "es",
        label: "español",
        words: [" el ", " la ", " los ", " las ", " para ", " con ", " que ", " una ", " del ", " actividad ", " estudiantes ", " aprendizaje ", " objetivo "]
    },
    {
        code: "en",
        label: "english",
        words: [" the ", " and ", " for ", " with ", " this ", " should ", " students ", " learning ", " objective ", " activity ", " lesson ", " write ", " explain "]
    },
    {
        code: "pt",
        label: "português",
        words: [" de ", " para ", " com ", " os ", " as ", " alunos ", " aprendizagem ", " objetivo ", " atividade ", " aula ", " texto "]
    },
    {
        code: "fr",
        label: "français",
        words: [" le ", " la ", " les ", " des ", " pour ", " avec ", " et ", " eleves ", " apprentissage ", " objectif ", " activite ", " cours "]
    }
];

function normalizarTextoIdioma(texto = "") {
    return ` ${String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()} `;
}

function detectarIdiomaPrincipal(texto = "") {
    const normalizado = normalizarTextoIdioma(texto);

    if (!normalizado.trim()) {
        return { code: "es", label: "español", confidence: 0 };
    }

    const scores = LANGUAGE_PROFILES.map((profile) => {
        let score = 0;
        for (const token of profile.words) {
            if (normalizado.includes(token)) score += 1;
        }
        return { ...profile, score };
    }).sort((a, b) => b.score - a.score);

    const mejor = scores[0];
    const segundo = scores[1] || { score: 0 };

    // Si no hay señal clara, mantener español por compatibilidad con el flujo actual.
    if (!mejor || mejor.score === 0 || (mejor.score - segundo.score) < 1) {
        return { code: "es", label: "español", confidence: 0.25 };
    }

    return {
        code: mejor.code,
        label: mejor.label,
        confidence: Number((mejor.score / Math.max(1, mejor.score + segundo.score)).toFixed(2))
    };
}



/* GENERAR CONTENIDO CON GEMINI */
async function generarContenidoGemini(options = {}) {
    // Obtener elementos por los IDs correctos
    const instruccionesElement = options.instruccionesDiv || document.getElementById("instruccionesSubtema");
    const resultadoElement = options.resultadoDiv || document.getElementById("resultadoGenerado");
    
    // Verificar que existan
    if (!instruccionesElement || !resultadoElement) {
        if (resultadoElement) {
            resultadoElement.innerHTML = `<p class="text-red-500 text-xs">Error: Elementos de UI no disponibles.</p>`;
        }
        return;
    }
    
    // Obtener texto de las instrucciones
    const instrucciones = instruccionesElement.innerText || instruccionesElement.textContent || "";
    
    // Obtener subtema y tema de window (donde están definidos)
    const subtema = options.subtema || window.subtemaActivo;
    const tema = options.tema || window.temaActivo;
    
    if (!subtema) {
        resultadoElement.innerHTML = `<p class="text-red-500 text-xs">No hay subtema activo seleccionado.</p>`;
        return;
    }

    if (!instrucciones.trim()) {
        resultadoElement.innerHTML = `<p class="text-red-500 text-xs">Escribe instrucciones para generar el contenido.</p>`;
        return;
    }

    const idiomaDetectado = detectarIdiomaPrincipal(instrucciones);

    resultadoElement.innerHTML = `
        <div class="flex items-center gap-2 text-blue-500">
            <i class="fas fa-spinner fa-spin"></i>
            <span class="text-xs">Generando introducción con Gemini (${idiomaDetectado.label})...</span>
        </div>
    `;

    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
# RESET — Nueva sesión
Olvida toda memoria anterior. No conserves contexto previo.  
Eres un experto en diseño instruccional, pedagogía y creación de cursos Moodle.
Trabaja EXCLUSIVAMENTE con la información proporcionada en las instrucciones del autor.

IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado en INSTRUCCIONES DEL AUTOR: ${idiomaDetectado.label} (${idiomaDetectado.code}).
- Responde TODO el contenido final en ${idiomaDetectado.label}.
- Si el idioma detectado NO es español, NO traduzcas la salida al español.
- Si hay mezcla de idiomas, prioriza el idioma dominante detectado (${idiomaDetectado.label}).

OBJETIVO:
Generar UNA INTRODUCCIÓN para el subtema:
"${subtema.nombre || 'Subtema sin nombre'}"

Esta introducción DEBE:
- Contextualizar al estudiante sobre el subtema.
- Describir qué aprenderá y por qué es importante.
- Conectar con el tema general (${tema?.nombre || 'Tema general'}).
- Motivar al estudiante a avanzar.
- NO debe resumir módulos ni actividades.
- NO debe mencionar "en este curso verás" ni listar.
- NO debe resumir contenido ya existente.
- NO debe analizar los módulos generados.
- NO debe hacer síntesis académica.
- Debe ser INTRODUCCIÓN pura.

INSTRUCCIONES DEL AUTOR:
${instrucciones}

=== FORMATO ===
${BLOQUE_FORMATO_MOODLE}

- NO uses estilos, clases, atributos, colores ni decoraciones.
- SOLO usa:
  <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>
- NO generes HTML complejo.
- NO generes HTML con contenedores.
- NO agregues envolturas como <div class="...">.
- NO uses bloques de código como \`\`\` html.
- NO describas lo que haces. Devuelve solo HTML limpio.

Estructura recomendada:
<h2>Título</h2>
<p>Párrafo introductorio</p>
<h3>Sección</h3>
<p>Texto</p>
<ul>
  <li>Elemento</li>
  <li>Elemento</li>
</ul>
        `;

        // INTENTAR MÁXIMO 3 VECES CON BACKOFF EXPONENCIAL
let lastError;
for (let intento = 0; intento < 3; intento++) {
    try {
        // 🔥 AGREGAR ESTA LÍNEA QUE FALTA:
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
                    if (response.status === 503 && intento < 2) {
                        // Espera progresiva: 2s, 4s, 8s...
                        const waitTime = 2000 * Math.pow(2, intento);
                        
                        // Actualizar mensaje para el usuario
                        resultadoElement.innerHTML = `  // ← ¡CAMBIA AQUÍ! Usa resultadoElement, no resultado
                            <div class="flex items-center gap-2 text-yellow-600">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span class="text-xs">Servidor ocupado, reintentando en ${waitTime/1000} segundos...</span>
                            </div>
                        `;
                        
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                    "<p>No se recibió respuesta válida.</p>";

                const textoLimpio = limpiarBloquesCode(texto);

                subtema.contenidoGenerado = textoLimpio;
                resultadoElement.innerHTML = textoLimpio;  // ← ¡CAMBIA AQUÍ!

                activarAccionesEnParrafos();
                guardarCursoFirebase();
                return; // Éxito, salir de la función

            } catch (error) {
                lastError = error;
                
                if (intento < 2) {
                    const waitTime = 1000 * Math.pow(2, intento);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        // Si llegamos aquí, todos los intentos fallaron
        throw lastError;

    } catch (error) {
        resultadoElement.innerHTML = `  // ← ¡CORREGIDO! Cambiar resultado por resultadoElement
            <div class="text-red-500 text-xs">
                <p>Error generando contenido: ${error.message}</p>
                <p class="mt-2">Posibles soluciones:</p>
                <ul class="list-disc pl-4 mt-1">
                    <li>Intenta nuevamente en unos segundos</li>
                    <li>Verifica tu conexión a internet</li>
                    <li>Usa un modelo diferente (gemini-1.5-flash-latest)</li>
                </ul>
                <button class="mt-3 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                        onclick="generarContenidoGemini()">
                    Reintentar
                </button>
            </div>
        `;
    }

}


/* ============================================================
   GENERAR CONTENIDO PARA MÓDULO ESPECÍFICO (QUIZ, PÁGINA, ETC)
============================================================ */
export async function generarModuloGemini(moduloId) {

    // 1. Validar curso global (variable correcta: window.curso)
    if (!window.curso) {
        alert("Error interno: no hay curso activo cargado.");
        return;
    }

    // 2. Validar subtema activo
    const subtema = window.subtemaActivo;
    if (!subtema) {
        alert("No hay un subtema activo seleccionado.");
        return;
    }

    // 3. Traer módulo
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) {
        alert("No se encontró el módulo en Firebase.");
        return;
    }

    // 4. Validar instrucciones
    if (!modulo.instrucciones || modulo.instrucciones.trim() === "") {
        alert("❗ Primero debes añadir instrucciones con el ícono de comentarios.");
        return;
    }

    // 5. Spinner
    const card = document.getElementById(`modulo-${moduloId}`);
    if (card) {
        const old = card.querySelector(".modulo-contenido");
        if (old) old.remove();

        card.insertAdjacentHTML("beforeend", `
            <div class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-blue-500 flex items-center gap-2 modulo-contenido">
                <i class="fas fa-spinner fa-spin"></i>
                <span class="text-xs">Generando contenido del módulo...</span>
            </div>
        `);
    }

    try {
        const instruccionesRaw = modulo.instrucciones || "";
        const { textOnly: instruccionesSoloTexto, images: imagenesInstrucciones } =
            extraerPartesMultimodalesDesdeInstrucciones(instruccionesRaw);
        const idiomaDetectadoModulo = detectarIdiomaPrincipal(
            `${modulo?.nombre || ""}\n${instruccionesSoloTexto || ""}`
        );

        // Detectar si autor pidió tabla
        const instrucciones = instruccionesSoloTexto.toLowerCase();
        const autorPidioTabla =
            instrucciones.includes("tabla") ||
            instrucciones.includes("table") ||
            instrucciones.includes("<table") ||
            instrucciones.includes("columnas") ||
            instrucciones.includes("en formato tabla") ||
            instrucciones.includes("organiza en tabla");


        // 🔥 NUEVO: Detectar si el usuario incluye una lectura que NO debe modificarse
        const tieneLecturaProtegida = instrucciones.includes("no modifiques") && 
                                     (instrucciones.includes("lectura") || 
                                      instrucciones.includes("texto original") ||
                                      instrucciones.includes("transcribir") ||
                                      instrucciones.includes("copia exacta"));

        const permisoTablas = autorPidioTabla
            ? `
        ===== PERMITIR TABLAS =====
        ✔ Puedes usar <table>, <tr>, <td>, <th>
        ✔ Puedes estructurar información en tabla si el autor lo pidió.
        ===========================
        `
                    : `
        ===== RESTRICCIÓN DE TABLAS =====
        ❗ No uses tablas a menos que el autor las haya pedido.
        =============================
        `;

        const bloqueContenidoProtegido = tieneLecturaProtegida ? `
        ===== INSTRUCCIÓN ESPECIAL: CONTENIDO PROTEGIDO =====
        El autor ha incluido contenido (lectura/texto) que NO debe modificarse bajo ninguna circunstancia.
        Este contenido debe ser transcrito EXACTAMENTE como está, sin cambios, sin resúmenes, sin parafrasear.
        NO interpretes, NO analices, NO resumas, NO reescribas este contenido.
        Transcríbelo literalmente manteniendo su formato original.
        El autor verificará que el contenido NO haya sido modificado.
        =========================================================
        ` : "";

        // **🔵 AQUÍ YA ESTÁ CORREGIDO — Usa window.curso**
        const prompt = `
        # CONTEXTO GLOBAL DEL CURSO
        ${obtenerContextoCompletoDelCurso(window.curso)}

        # CONTEXTO DEL SUBTEMA ESPECÍFICO
        ${obtenerContextoCompletoDelSubtema(window.subtemaActivo)}

        # GENERAR NUEVO MÓDULO
        Tipo: ${modulo.tipo}
        Nombre: ${modulo.nombre}

        ===== INSTRUCCIONES DEL AUTOR =====
        ${instruccionesSoloTexto || "(Sin instrucciones textuales. Usa la imagen adjunta como referencia principal.)"}

        ${permisoTablas}

        ===== REGLAS PEDAGÓGICAS =====
        ${promptExtraPorTipo(modulo.tipo)}

        ===== FORMATO DE SALIDA =====
        ${BLOQUE_FORMATO_MARKDOWN}

        ===== IDIOMA DE SALIDA (OBLIGATORIO) =====
        - Idioma detectado en instrucciones del módulo: ${idiomaDetectadoModulo.label} (${idiomaDetectadoModulo.code}).
        - Devuelve TODO el contenido final en ${idiomaDetectadoModulo.label}.
        - Si el idioma detectado NO es español, NO traduzcas la respuesta al español.
        - Mantén el tono natural del idioma detectado.

        DEVUELVE SOLO MARKDOWN ESTRUCTURADO.
        Si alguna instrucción previa incluye ejemplos en HTML, conviértelos a markdown equivalente.
        NO menciones que eres IA.
        ${tieneLecturaProtegida ? "⚠️ ADVERTENCIA CRÍTICA: Si el autor incluyó una lectura, NO la modifiques si el autor lo indica. Transcríbela exactamente como está." : ""}
        NO repitas contenido existente.
        NO hagas explicaciones.
        `;

        // Llamar a Gemini
        const endpoint = getGeminiEndpoint();

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        ...imagenesInstrucciones.map((img, index) => ({
                            text: `Imagen de referencia ${index + 1}: analiza su contenido visual y úsalo para generar el módulo.`
                        })),
                        ...imagenesInstrucciones.map((img) => ({
                            inline_data: {
                                mime_type: img.mimeType,
                                data: img.data
                            }
                        }))
                    ]
                }]
            })
        });

        if (!res.ok) {
            let detalle = "";
            try {
                const errJson = await res.json();
                detalle = errJson?.error?.message || JSON.stringify(errJson);
            } catch (_) {
                detalle = res.statusText || "Error desconocido del servidor";
            }
            throw new Error(`Gemini HTTP ${res.status}: ${detalle}`);
        }

        const data = await res.json();
        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        texto = limpiarBloquesCode(texto);
        texto = limpiarRespuestaGemini(texto);

        // Guardar
        await guardarModulo(moduloId, { contenido: texto });

        // Pintar en UI
        const cont = document.getElementById(`contenido-${moduloId}`);
        if (cont) {
            if (typeof window.renderizarContenidoModulo === "function") {
                cont.innerHTML = window.renderizarContenidoModulo(texto);
            } else {
                cont.innerHTML = texto;
            }
        }

        const sp = card?.querySelector(".modulo-contenido");
        if (sp) sp.innerHTML = "<p class='text-green-600 text-xs'>✓ Contenido generado</p>";

    } catch (e) {
        console.error("Error en generarModuloGemini:", e);
        alert(`Hubo un error al generar el módulo con IA.\n${e?.message || ""}`);
    }
}




/**
 * Llama a Gemini de forma iterativa para obtener contenido largo.
 * - Usa el promptInicial
 * - Si la respuesta se corta, genera un nuevo prompt de continuación
 * - Pega todas las partes en un solo HTML
 */
async function generarContenidoLargoConGemini(promptInicial, maxIter = 5) {
    const endpoint = getGeminiEndpoint();
    let acumulado = "";
    let promptActual = promptInicial;

    for (let i = 0; i < maxIter; i++) {
        let response;
        let data;
        
        // INTENTAR MÁXIMO 3 VECES POR FRAGMENTO
        for (let intento = 0; intento < 3; intento++) {
            try {
                response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptActual }] }]
                    })
                });

                // Si es 503, esperar y reintentar
                if (response.status === 503) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (intento + 1))); // Espera progresiva
                    continue;
                }

                // Si es otro error, lanzar excepción
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                data = await response.json();
                break; // Salir del bucle de reintentos si tuvo éxito
                
            } catch (error) {
                if (intento === 2) throw error; // Último intento, lanzar error
                await new Promise(resolve => setTimeout(resolve, 1000 * (intento + 1)));
            }
        }

        let fragmento = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";


        fragmento = limpiarBloquesCode(fragmento);
        fragmento = limpiarRespuestaGemini(fragmento);

        acumulado += (acumulado ? "\n" : "") + fragmento;

        // Si esta parte NO parece cortada, salimos del bucle
        if (!esRespuestaCortadaPorTokens(fragmento)) {
            break;
        }

        // Construir nuevo prompt para continuar
        promptActual = `
            Continúa EXACTAMENTE donde te quedaste.
            NO repitas nada.
            NO cambies el formato.
            Respeta estrictamente:

            ${BLOQUE_FORMATO_MOODLE}

            CONTENIDO HASTA AHORA:
            ${acumulado}
        `;

    }

    return acumulado;
}


async function reformularParrafoConIA(textoOriginal) {
    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
Reformula el siguiente párrafo con un estilo claro, profesional y fluido.
Sin comentarios, sin explicaciones.
Devuelve SOLO el texto reformulado, sin HTML adicional.

=== PÁRRAFO ===
${textoOriginal}
        `;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        // Extraer texto seguro
        const nuevo = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || textoOriginal;

        return nuevo;

    } catch (error) {
        return textoOriginal;
    }
}



function promptExtraPorTipo(tipo) {
    switch (tipo) {
case "Quizz": return `
Genera un CUESTIONARIO (Quizz) en markdown estructurado.

REGLAS:
- Usa secciones por pregunta con encabezado "## Pregunta X — Tipo".
- Incluye al menos 5 preguntas y mezcla tipos (opción múltiple, verdadero/falso, respuesta corta y una de aplicación).
- Cada pregunta debe tener:
  - **Pregunta**
  - **Opciones** (si aplica)
  - **Respuesta correcta**
  - **Retroalimentación correcta**
  - **Retroalimentación incorrecta**
  - **Retroalimentación global**
- No uses HTML.
- No uses texto plano corrido; usa listas y encabezados.
`;


        case "Página": return `
        Genera una PÁGINA Moodle en markdown estructurado, con contenido didáctico claro.

        CRÍTICAMENTE IMPORTANTE:
        1. Si el autor incluye una lectura con instrucciones explícitas como "no modifiques", "transcribe exactamente", "copia tal cual":
        - NO PARAFRASEES el contenido proporcionado
        - NO RESUMAS el contenido proporcionado
        - NO INTERPRETES el contenido proporcionado
        - TRANSCRIBE EXACTAMENTE el texto proporcionado
        - MANTÉN el formato original si está especificado
        - El contenido protegido debe aparecer IDÉNTICO al original

        2. Para contenido que SÍ debes generar:
        - Título principal
        - Introducción breve (contexto y propósito)
        - Desarrollo del contenido:
            - Explicación clara y concisa
            - Viñetas o listas organizadas
            - Ejemplos concretos
            - Destacar conceptos clave con subtítulos
            - ✅ SE PERMITEN TABLAS para organizar información cuando sea necesario
        - Actividades de reflexión o práctica (2 o 3)

        3. REGLAS DE FORMATO:
        - Usa títulos jerárquicos markdown (#, ##, ###)
        - Usa listas para organizar ideas y pasos
        - Puedes usar tablas markdown cuando aporten claridad
        - El contenido debe ser didáctico y profesional
        - Si hay contenido protegido, intégralo en el lugar apropiado SIN CAMBIARLO

        IMPORTANTE: Si el autor dice "transcribe esta lectura sin modificar", respeta eso completamente.
        NO intentes "mejorar" ni "reformular" el contenido protegido.
        `;


        case "Libro": return `
        Genera un LIBRO estilo Moodle en markdown con capítulos organizados.
        Incluye lo siguiente:

        1) Estructura:
        - Usa "## Capítulo 1", "## Capítulo 2", etc.

        2) Contenido:
        - Texto explicativo breve y didáctico hasta 3 párrafos medianos.
        - asociar con estudios científicos (si aplica).
        - Texto estructurado con **negritas**, *itálicas*, listas y subtítulos.

        3) Actividades integradas:
        - Al final de cada capítulo, añade la referencia bibliográfica en el que se basó el capítulo en formato APA.

        4) Estilo:
        - Lenguaje claro, natural y pedagógico.
        - No generar rutas alternativas (esta actividad es lineal).
        - No incluir ningún comentario extra de la ia

        Estructura de salida:
        - "## Capítulo X: Título"
        - "### Desarrollo"
        - "### Actividad sugerida"
        - "### Referencias (APA)"
        `;

        case "Lección": return `
        Genera una LECCIÓN estilo Moodle en markdown, estructurada en pantallas con navegación ramificada.
        Incluye:

        1) escenas de Contenido:
        - No hagas comentarios extras de la ia, devuelve solo lo solicitado.

        2) Rutas Alternativas:
        - Crea caminos alternos dependiendo de las decisiones del alumno.
        - Cada opción correcta debe llevar a otra escena (nombrar destino).

        3) Preguntas Interactivas:
        - Cada escena debe tener una pregunta de opción múltiple.
        - Formatos: opción múltiple, verdadero/falso o respuesta corta.
        - Para cada respuesta, especifica el salto correspondiente (ej: “Ir a: Escena 2 - Título de la escena).

        4) Rutas de Refuerzo:
        - Si el alumno se equivoca, debe enviarlo a una pantalla de retroalimentación y luego regresar al inicio.

        5) Escena Final:
        - Mensaje de cierre.
        - Botón “Terminar Lección”.

        Estructura la salida así:
        - "## Escena 1: Título"
        - "### Contenido"
        - "### Pregunta"
        - "### Opciones y salto"
        - "### Retroalimentación"
        - Repetir para escenas siguientes
        - "## Escena final"

        Usa lenguaje claro, didáctico y atractivo.
        Personaliza todo según el tema específico solicitado por el usuario.
        `;

        default: return `
Genera recurso Moodle profesional en markdown estructurado (encabezados, listas y secciones claras).
        `;
    }
}


function obtenerContextoCompletoDelCurso(curso) {
    if (!curso || !curso.temas) return "";

    let texto = "=== CONTEXTO COMPLETO DEL CURSO ===\n\n";

    curso.temas.forEach(tema => {
        texto += `\n\n[Tema: ${tema.nombre}]\n`;

        if (!tema.subtemas || tema.subtemas.length === 0) {
            texto += "  (Este tema no tiene subtemas)\n";
            return;
        }

        tema.subtemas.forEach(sub => {
            texto += `\n  • Subtema: ${sub.nombre}\n`;

            if (sub.instrucciones) {
                texto += `    Instrucciones: ${sub.instrucciones}\n`;
            }

            if (sub.contenidoGenerado) {
                texto += `    Introducción generada:\n${sub.contenidoGenerado}\n`;
            }

            if (sub.modulos && sub.modulos.length > 0) {
                texto += `    Módulos existentes:\n`;

                sub.modulos.forEach(mod => {
                    texto += `
        [${mod.tipo}] ${mod.nombre}
        Instrucciones:
        ${mod.instrucciones || "<sin instrucciones>"}

        Contenido existente:
        ${mod.contenido || "<sin contenido>"}
`;
                });
            } else {
                texto += "    (Este subtema no tiene módulos)\n";
            }
        });
    });

    texto += "\n=== FIN DEL CONTEXTO DEL CURSO ===\n\n";
    return texto;
}



function obtenerContextoCompletoDelSubtema(subtema) {
    if (!subtema) return "";

    let contexto = "=== CONTEXTO COMPLETO DEL SUBTEMA ===\n\n";

    // Instrucciones generales del subtema
    contexto += `INSTRUCCIONES DEL SUBTEMA:\n${subtema.instrucciones || "<sin instrucciones>"}\n\n`;

    // Contenido generado general
    contexto += `CONTENIDO GENERAL GENERADO:\n${subtema.contenidoGenerado || "<sin contenido general>"}\n\n`;

    // Módulos
    contexto += "=== MÓDULOS EXISTENTES ===\n\n";
    const modulosSubtema = Array.isArray(subtema.modulos) ? subtema.modulos : [];
    if (modulosSubtema.length === 0) {
        contexto += "(No hay módulos cargados en memoria para este subtema)\n";
        if (Array.isArray(subtema.modulosIds) && subtema.modulosIds.length > 0) {
            contexto += `IDs de módulos en el subtema: ${subtema.modulosIds.join(", ")}\n`;
        }
        return contexto;
    }

    modulosSubtema.forEach(mod => {
        contexto += `
[Módulo: ${mod.nombre}]
Tipo: ${mod.tipo}

Instrucciones:
${mod.instrucciones || "<sin instrucciones>"}

Contenido:
${mod.contenido || "<sin contenido>"}

---------------------------------------------
`;
    });

    return contexto;
}



function limpiarBloquesCode(text = "") {
    if (!text) return "";

    // Quitar bloques tipo ```html ... ```
    return text
        .replace(/```html/gi, "")
        .replace(/```/g, "")
        .trim();
}



function limpiarRespuestaGemini(text = "") {
    if (!text) return "";

    let limpio = text;

    // 1) Limpiar bloques ``` ``` sin tocar HTML interno
    limpio = limpiarBloquesCode(limpio);

    // 2) Eliminar solo spans que NO estén dentro de tablas
    // Conservamos spans dentro de <table>, <tr>, <td>, <th>
    limpio = limpio.replace(
        /(<(?!td|th|tr|table)[^>]*)(<span(?![^>]*color:red)(?![^>]*color:green)[^>]*>)([^<]*)(<\/span>)/gi,
        "$1$3"
    );


    // Por eso filtramos SOLO elementos FUERA de tablas
    limpio = limpio.replace(
        /<(?!table|tr|td|th)(\w+)([^>]*)>/gi,
        (match, tag, attrs) => {
            // Quitar solo class/id/data- de tags no tabulares
            return `<${tag}${attrs}>`;
        }
    );

    // 5) Mantener style="color:red/green" sin tocar style dentro de tablas
    limpio = limpio.replace(
        /<(?!table|tr|td|th)(\w+)([^>]*)style="([^"]*)"/gi,
        (match, tag, attrs, styles) => {
            if (!styles.includes("color:red") && !styles.includes("color:green"))
                return `<${tag}${attrs}>`;
            return match;
        }
    );


    return limpio.trim();
}


/* ============================================================
   HELPERS PARA MANEJAR RESPUESTAS LARGAS / CORTADAS DE GEMINI
============================================================ */

/**
 * Heurística simple para detectar si una respuesta se cortó por tokens.
 */
function esRespuestaCortadaPorTokens(texto = "") {
    if (!texto) return true;

    const t = texto.trim();

    // Termina en CONTINÚA (según lo que pedimos en el prompt)
    if (/CONTINUA$|CONTINÚA$/i.test(t)) return true;

    // Termina de forma rara / incompleta
    if (t.endsWith("...") || t.endsWith(":") || t.endsWith("-")) return true;

    // Respuestas sospechosamente cortas
    if (t.split(/\s+/).length < 10) return true;

    return false;
}





// Exporta las funciones
export { 
    generarContenidoGemini, 
    getGeminiEndpoint,
    reformularParrafoConIA,
    promptExtraPorTipo,
    obtenerContextoCompletoDelCurso,
    obtenerContextoCompletoDelSubtema,
    limpiarBloquesCode,
    limpiarRespuestaGemini,
    esRespuestaCortadaPorTokens,
    generarContenidoLargoConGemini,
};
