/**
 * Prompts & Editorial Rules Service — Charly Brown
 * Manages global system prompt definitions and user customization.
 */

export const DEFAULT_INTERNAL_PROMPTS = Object.freeze({
  activityProfile: `- Estructura de página por subtema: Cada subtema NO es una sola actividad monolítica, sino una secuencia integrada de actividades cortas, breves y dinámicas. Regla especial de Matemáticas: genera exactamente 6 bloques <div class="activity"> independientes por subtema, cada uno con título, consigna, pasos propios y respuesta esperada; no los sustituyas por seis <li> de una sola actividad. Para el resto de subtemas, usa entre 3 y 5 ejercicios numerados dentro de <ol class="steps steps-numbered"> o varios bloques <div class="activity"> según su propósito.
- Título destacado del subtema:
  • Inicia directamente con un único título temático creativo, sugerente y breve (2 a 4 palabras), formateado con encabezado h2 con tipografía rounded (ej. <h2 class="cb-activity-title" style="font-family: 'Fredoka', 'Quicksand', 'Nunito', system-ui, sans-serif; font-size: 1.55rem; font-weight: 600; line-height: 1.25; margin-bottom: 0.75rem;">Oraciones ordenadas</h2>). NUNCA uses el nombre genérico de la materia o categoría como título.
- Consignas principales con verbo imperativo (NUNCA iniciar con pregunta):
  • Toda actividad o instrucción numerada comienza OBLIGATORIAMENTE con su consigna breve en modo imperativo dirigida al alumno (ej. <strong>Escribe en orden...</strong>, <strong>Observa el video...</strong>, <strong>Localiza las oraciones...</strong>, <strong>Analiza el anexo...</strong>, <strong>Ordena las palabras...</strong>, <strong>Resuelve la ficha...</strong>, <strong>Lee el texto...</strong>, <strong>Compara con tus compañeros...</strong>).
  • NUNCA comiences una actividad con una pregunta (no uses ¿Qué...?, ¿Cómo...?, ¿Cuál...?, ¿Por qué...? como apertura de la consigna).
  • Si la actividad requiere diálogo o reflexión oral, la pregunta va SIEMPRE DESPUÉS de la instrucción imperativa inicial (por ejemplo: "<strong>Localiza las oraciones subrayadas en la lectura y léelas en voz alta.</strong> Comenta: ¿de quién o de qué se habla? ¿Qué hace o qué se dice del sujeto? [IC. T. PAR]").
- Código y nomenclatura exacta de recursos complementarios:
  • Al mencionar un recurso en la consigna, utiliza estrictamente su código según la unidad y letra correlativa:
    - Fichas: "Ficha 1a", "Ficha 1b", "Ficha 2a", etc.
    - Anexos: "Anexo 1a", "Anexo 1b", "Anexo 2a", etc.
    - Recortables: "Recortable 1a", "Recortable 1b", "Recortable 2a", etc.
    - Videos: "Video [Nombre del video]" (ej. 'Observa el video "He cambiado" y comenta. [IC. T.EQ]').
  • La mención del recurso debe integrarse de forma natural y con verbo en imperativo (ej. "<strong>Resuelve la Ficha 1a.</strong> ...", "<strong>Analiza el Anexo 1a "Evolución anfibia".</strong> ...", "<strong>Utiliza el Recortable 1a.</strong> ...", "<strong>Observa el video "He cambiado" y comenta.</strong> ...").
- Adecuación de extensión por grado escolar:
  • Primero de Primaria: Actividades MUCHO MÁS CORTAS, ágiles y visuales. Consignas brevísimas de 1 renglón (10-14 palabras), frases simples de 4 a 6 palabras, tareas de motricidad y alfabetización inicial (encerrar, unir, ordenar 3 o 4 palabras familiares, trazar, colorear, diálogo oral muy guiado). Respuestas esperadas concisas.
  • Sexto de Primaria: Actividades MUCHO MÁS LARGAS, profundas y estructuradas. Consignas analíticas y desafiantes, producción de textos de varios párrafos, contraste de fuentes, debates fundamentados y justificación detallada en respuestas esperadas.
- Secuencia para subtemas regulares (de 3 a 5 actividades numeradas y breves; en Matemáticas aplica la regla de seis bloques independientes indicada arriba):
  1. Actividad de activación / lectura en voz alta / observación: Consigna concisa con Lead Bold y modalidad [IC. T. IND].
  2. Actividad de aplicación práctica, ordenamiento o ejercitación: Consigna directa (ej. ordenar palabras, clasificar, completar) [IC. T. IND].
  3. Actividad con el Recurso complementario (si la sección tiene asignado ficha, anexo, recortable o video): Consigna directa con el código del recurso [IC. T. IND].
  4. Actividad de diálogo reflexivo / puesta en común: Preguntas de diálogo oral después de la consigna ("<strong>Comenten en parejas sus respuestas.</strong> ¿Qué descubrieron? [IC. T. PAR]").
  5. Actividad de cierre / práctica lúdica: Consigna breve ("Juego y practico" o conexión con el hogar) [IC. T.EQ].
- Cajas didácticas flotantes intercaladas (opcionales):
  • "Estrategia" (.cb-card-strategy): Consejo práctico paso a paso de modulación de voz, técnica de lectura o estrategia de cálculo.
  • "Para saber más" (.cb-card-learn-more): Cápsula conceptual breve o dato sobre fluidez, entonación o conocimiento clave.
  • "Glosario" (.cb-card-glossary): Vocabulario clave.
- Regla de redacción estricta (Lead Bold): Toda instrucción inicia obligatoriamente con la primera frase completa en negritas (<strong>...</strong>) hasta el primer punto y seguido o dos puntos. Lo posterior va en letra normal. Prohibido poner en negrita solo 2 o 3 palabras sueltas.
- PROHIBIDO USAR EMOJIS: NUNCA uses emojis en las instrucciones ni en las actividades. La modalidad didáctica debe indicarse siempre en texto entre corchetes al final de la consigna:
  • Modalidades generales: individual [IC. T. IND], parejas [IC. T. PAR], equipos [IC. T.EQ], expresión oral [IC. EXPRESION ORAL], observación de video [IC. OBSERVA VIDEO].
  • Acciones pedagógicas (1° de Primaria): [IC. Lee], [IC. Escribe], [IC. Dibuja], [IC. Recorta], [IC. Comenta].
- Plecas de respuesta, paréntesis y solucionario magenta:
  • Respuestas en paréntesis o corchetes (opción múltiple, falso/verdadero, ordenar cronológicamente):
    - La respuesta esperada en color magenta (#e6007e) se coloca DIRECTAMENTE DENTRO del paréntesis o corchete: ( <span style="color:#e6007e;">a</span> ) o [ <span style="color:#e6007e;">X</span> ], tal como si el alumno la hubiera contestado en el examen o cuaderno.
    - PROHIBIDO generar un bloque <div class="answer"> separado debajo para incisos que ya tienen paréntesis o corchetes para responder.
  • Líneas de respuesta abiertas (preguntas abiertas, redacción o completado):
    - En actividades que incluyan preguntas, ejercicios de completar o redacción, incluye líneas de respuesta escolares para el alumno.
    - Las respuestas breves usan una pleca corta; solo las respuestas de varias palabras usan el ancho disponible.
    - EXACTAMENTE UNA LÍNEA DE TEXTO POR PLECA: No saturar con respuestas largas. Las soluciones esperadas deben ser concisas y sintéticas (máximo 40 a 50 caracteres por línea).
    - Incluye 2 o 3 líneas según la cantidad de respuesta:
      <div class="answer"><div class="cb-response-line"><span class="cb-teacher-resp" style="color:#e6007e;">[solución concisa]</span></div><div class="cb-response-line"></div></div>. No escribas etiquetas como “Respuesta esperada”.
    - En 1° y 2° cada .cb-response-line es una caja caligráfica con dos guías azules punteadas; coloca el texto magenta entre ambas guías. Si la respuesta ocupa dos renglones, divide el contenido en dos .cb-response-line completos. Nunca envuelvas una respuesta larga dentro de una sola caja ni pongas etiquetas como “Respuesta esperada”.
  • Diferenciación por nivel escolar:
    - Primero y Segundo (1° y 2°): Pleca caligráfica rectangular con borde rosa suave y guías punteadas azul verdoso. Las respuestas cortas usan una caja corta. Letra manuscrita/cursiva escolar.
    - A partir de Tercero (3°, 4°, 5°, 6°): NO lleva caja; es solo una línea horizontal azul claro por renglón de texto de respuesta. Letra normal sencilla a partir de 4°.
- Metodología de Habilidades Cognitivas (Estructura de la Inteligencia - J. Paul Guilford / Metodología ASC):
  • Cada subtema y actividad debe intencionar deliberadamente el desarrollo de una habilidad cognitiva basada en el modelo tridimensional SOI (código de 3 letras [Proceso][Producto][Contenido]):
    1. PROCESO DE LA INFORMACIÓN (Primera letra):
       - C (Captación): Reconocimiento, discriminación visual/auditiva, identificación, lectura inicial y comprensión perceptual directa (ej. observar, localizar, distinguir).
       - M (Memoria): Retención, almacenamiento, reproducción y evocación de información aprendida sin soporte visible inmediato.
       - E (Evaluación): Juicio crítico, comparación, verificación de corrección o error, discriminación de opciones y selección fundamentada (ej. verificar resultados, corregir errores, argumentar).
       - N (Producción Convergente): Deducción lógica, cálculo numérico, resolución de problemas guiados con solución unívoca y seguimiento estricto de algoritmos.
       - D (Producción Divergente): Creatividad, generación de múltiples respuestas, fluidez de ideas, invención, soluciones alternas y expresión original libre.
    2. PRODUCTO DE LA INFORMACIÓN (Segunda letra):
       - U (Unidades): Elementos o ítems individuales aislados (una letra, un trazo, un dígito, una palabra suelta, una figura).
       - C (Clases): Conjuntos, agrupaciones, campos semánticos y clasificación de elementos por propiedades comunes.
       - R (Relaciones): Conexiones, correspondencias, asociaciones, pares opuestos/sinónimos, analogías y vínculos causa-efecto directos.
       - S (Sistemas): Estructuras complejas organizadas (oraciones completas, párrafos articulados, lecturas, algoritmos o secuencias de pasos).
       - T (Transformaciones): Cambios de forma, reorganización, sustituciones, reescritura, giros y conversiones de formato.
       - I (Implicaciones): Inferencias, predicciones, extrapolaciones, deducciones sobre lo implícito y conclusiones lógicas.
    3. CONTENIDO DE LA INFORMACIÓN (Tercera letra):
       - F (Figurativo): Material visual y psicomotor concreto (formas espaciales, trazos caligráficos, dibujos, colores, láminas, recortables).
       - S (Simbólico): Signos abstractos, códigos formales (letras aisladas, números, signos matemáticos, reglas de puntuación y ortografía).
       - M (Semántico): Significado verbal, ideas, conceptos, comprensión lectora profunda y vocabulario contextualizado.
  • Criterio de Logro T.E.P.:
    - Toda actividad busca optimizar el T.E.P. del alumno: Tiempo (agilidad y ritmo de ejecución), Esfuerzo (concentración y persistencia activa) y Precisión (exactitud en la respuesta o trazo).
  • Asignación y marcado de la Habilidad Cognitiva:
    - Diseña las consignas del subtema para graduar el reto: parte de Captación (C) o Memoria (M) para explorar y activar; continúa con Producción Convergente (N) o Relaciones (R) para resolver; y culmina con Evaluación (E) o Producción Divergente (D) para profundizar y crear.
    - Indica la habilidad cognitiva dominante del subtema agregando el atributo data-cognitive-code="XYZ" en el contenedor o en el título h2 (ej. <h2 class="cb-activity-title" data-cognitive-code="CSM">...</h2> o data-cognitive-code="NSS" en matemáticas, "CUF" en trazos, etc.).`,

  activityContractProfile: `- Sigue las reglas estructurales y de extensión definidas para el grado, la categoría y el subtema.
- Conserva las etiquetas HTML canónicas y devuelve únicamente contenido que pueda aprobarse como actividad del alumno.`,

  refinementProfile: `- Refina el material aprobado sin cambiar sus hechos, propósito curricular, respuestas correctas ni recursos.
- Corrige únicamente lo que solicite el usuario y conserva la estructura válida del HTML.`,

  chatProfile: `- Responde en español con texto estructurado y legible (Markdown cuando ayude); no entregues etiquetas HTML literales en respuestas conversacionales.
- Si el usuario pide revisar contenido aprobado, consulta el texto completo de la unidad y evalúa la redacción visible: claridad, ortografía, coherencia, progresión pedagógica, duplicados y correspondencia de recursos. Trata el HTML solo como formato: ignora etiquetas, atributos, clases y detalles de implementación; no reportes defectos del marcado como incoherencias didácticas.
- Distingue entre una propuesta de mejora editorial y un error comprobable. Cita el nombre de la actividad y fragmentos breves del texto al explicar hallazgos.
- No presentes una propuesta formal ni generes actividades hasta que el usuario lo solicite.`,

  teacherNotes: `- Escribe las notas en segunda persona para el docente, con indicaciones prácticas, inclusivas y listas para aplicar.
- Usa como único encabezado <h3> el título exacto de la actividad aprobada. Quita únicamente el prefijo "Actividad:" o "Actividad 1:"; no inventes otro título. Para notas de recurso, usa el título exacto del recurso.
- Bajo ese título, integra en párrafos la preparación, modelado, desarrollo, verificación, ampliación y refuerzo que resulten pertinentes. No agregues otros subtítulos.
- Si una actividad usa un recurso, indica cuándo utilizarlo y cómo acompañar al alumno. Si incluye recortable, integra las indicaciones de corte, mediación, pegado y clave dentro de la misma nota de la actividad. Los recortables nunca llevan notas del maestro independientes.
- Para una solicitud global, entrega una sección por actividad y conserva su orden.
- No agregues una sección general de fichas ni copies instrucciones dirigidas al alumno.`,

  worksheet: `- Diseña una ficha práctica de ejercitación sistemática de página completa (Ficha [Código] [Título]).
- Aplica la misma regla de redacción Lead Bold: Instrucciones con lead en <strong> hasta el primer punto y micro-íconos de modalidad.
- Formatos estructurados según la materia:
  • Ficha de Redacción: Pauta amplia de 12 a 15 renglones continuos en tono celeste con recuadro temático.
  • Ficha de Clasificación: Recuadro crema con viñetas de datos contextuales + tabla de columnas bicolor (magenta/cian) para clasificar + preguntas de análisis.
  • Ficha de Inferencia: Adivinanzas o deducciones geográficas/científicas con líneas de respuesta espaciadas.
  • Ficha Recortable Híbrida: Plantilla escalonada de valor posicional (DM, UM, C, D, U) con contornos de tijera y líneas punteadas.
- Incluye respuestas esperadas en color magenta (#e6007e) dentro de <div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">...</span></div>.`,

  annex: `- Diseña láminas didácticas visuales de página completa con imágenes raster originales generadas por el modelo de imagen de Gemini (fotografías realistas, estilo de ilustración vectorial nítida o infografías de calidad libro de texto editorial).
- "Estilo vectorial" describe el acabado visual de la imagen creada por Gemini. Nunca entregues SVG, canvas, formas HTML ni gráficos construidos por código.
- Título formal centrado y código visible (ej. "Anexo 1a [Título]").
- REGLA ESTRICTA: El anexo es un recurso visual puro de soporte e información de consulta visual. No contiene preguntas, renglones en blanco ni ejercicios para resolver dentro de él.
- Tipologías con imágenes y gráficos reales:
  • Fotografías científicas, biológicas o históricas reales: Animales en su hábitat, plantas, experimentos, fósiles o fenómenos naturales.
  • Infografías de alta resolución editorial: Láminas temáticas con esquemas visuales, datos clave y rótulos nítidos.
  • Mosaicos y paneles visuales: Composiciones fotográficas o vectoriales de consulta rápida para observación guiada.
  • Mapas, esquemas y diagramas ilustrados: Representaciones geográficas, astronómicas o anatómicas realistas.`,

  cutout: `- Diseña recortables manipulativos didácticos como imágenes raster originales generadas por el modelo de imagen de Gemini, a todo color y con calidad de libro infantil.
- ESTILO VISUAL OBLIGATORIO: Ilustración artística o digital a todo color, con volumen, sombras suaves y texturas cálidas. PROHIBIDO terminantemente el estilo de líneas negras, planos esquemáticos, diagramas vectoriales vacíos, wireframes o dibujos para colorear.
- La imagen principal debe mostrar objetos y personajes realmente ilustrados, completos y limpios, sin outlines punteados, líneas de corte ni iconos de tijera.
- Usa fondo blanco o neutro para facilitar el recorte; no agregues texto, etiquetas ni recuadros sin función.
- No uses SVG, canvas, formas HTML ni gráficos construidos por código. Si Gemini no produce la imagen, el recurso debe fallar de forma explícita.`,

  videoScript: `- Redacta un guion audiovisual educativo breve (compatible con podcaster y Google VEO) estructurado en tabla canónica sin columna de Escena (columnas: Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición, Elemento visual). NO incluyas columna de Escena.
- REGLA ESTRICTA DE ESCENAS: Cada escena debe durar FORZOSAMENTE 8 SEGUNDOS exactos (00:00–00:08, 00:08–00:16, 00:16–00:24, etc.). Google VEO solo crea clips de 8 segundos por escena.
- REGLA ESTRICTA DE NARRACIÓN: La columna 'Guion' (locución) debe contener ESTRICTAMENTE entre 14 y 17 palabras por escena (cadencia de voz pedagógica exacta para clips de 8 segundos).
- Desarrolla tres bloques: Gancho detonante, Desarrollo conceptual dinámico y Cierre con reto al estudiante.`,

  readingProfile: `- Escribe una lectura narrativa escolar completa, precisa, apropiada para Primaria y coherente con el grado y el tema.
- Usa un título breve y párrafos claros con vocabulario adecuado; no agregues preguntas, sinónimos ni respuestas en esta etapa.
- No dibujes ni incrustes SVG, canvas o imágenes dentro del HTML. La ilustración se genera después con el modelo de imagen de Gemini y se adjunta como archivo raster.`,

  synonymsProfile: `- Selecciona entre 6 y 10 palabras que aparezcan literalmente en la lectura y propón un sinónimo sencillo, apropiado para el grado.
- Devuelve únicamente una tabla HTML con las columnas Palabra y Sinónimo simple; no repitas la lectura ni añadas preguntas.`,

  comprehensionProfile: `- Formula cinco preguntas variadas que evalúen comprensión literal e inferencial de la lectura.
- Incluye la respuesta esperada junto a cada pregunta. Devuelve únicamente una lista HTML numerada y no repitas la lectura ni la tabla de sinónimos.`,

  readingIllustration: `- Crea con el modelo de imagen de Gemini una imagen original, colorida, editorial y apropiada para Primaria que represente el tema de la lectura.
- Incorpora detalles visuales consultables por el alumno solo si apoyan actividades pertinentes. No incluyas texto, números ni respuestas.
- Elige entre fotografía realista, ilustración editorial o acabado vectorial según el contenido. Entrega una imagen PNG, JPEG o WebP; nunca SVG, canvas ni formas construidas por código.`,

  contentReview: `Actúa como editor de libros escolares mexicanos. Reescribe solo donde haga falta para que el texto suene claro, concreto, cercano y profesional.
- Elimina introducciones genéricas, conclusiones de relleno y frases de asistente.
- Conserva exactamente los hechos, respuestas, citas, propósito pedagógico, nivel escolar, etiquetas y estructura HTML.
- No inventes ejemplos, experiencias personales, moralejas, emojis ni encabezados.
Devuelve únicamente el HTML final, sin comentarios ni bloques Markdown.`
});

const PROMPTS_STORAGE_KEY = "charly_custom_internal_prompts";
const PROMPTS_VERSION_KEY = "charly_prompts_version";
const CURRENT_PROMPTS_VERSION = "2026-09-27.v12-cutout-illustrations";

export function getInternalPrompts() {
  try {
    const version = localStorage.getItem(PROMPTS_VERSION_KEY);
    if (version !== CURRENT_PROMPTS_VERSION) {
      localStorage.setItem(PROMPTS_VERSION_KEY, CURRENT_PROMPTS_VERSION);
      const raw = localStorage.getItem(PROMPTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migrar automáticamente si contiene directivas obsoletas
        if (parsed?.videoScript && (parsed.videoScript.includes("6 columnas") || parsed.videoScript.includes("12 a 17 palabras") || !parsed.videoScript.includes("8 SEGUNDOS"))) {
          parsed.videoScript = DEFAULT_INTERNAL_PROMPTS.videoScript;
        }
        if (parsed?.activityProfile && (!parsed.activityProfile.includes("paréntesis") || parsed.activityProfile.includes("PROHIBIDO incluir class=\"cb-cintillo-axis\"") || !parsed.activityProfile.includes("Habilidades Cognitivas"))) {
          parsed.activityProfile = DEFAULT_INTERNAL_PROMPTS.activityProfile;
        }
        if (parsed?.teacherNotes && /Actividad General|Actividad de ampliación|Orientaciones metodológicas por actividad/i.test(parsed.teacherNotes)) {
          parsed.teacherNotes = DEFAULT_INTERNAL_PROMPTS.teacherNotes;
        }
        if (parsed?.annex && (!parsed.annex.includes("Gemini") || !parsed.annex.includes("Nunca entregues SVG") || parsed.annex.includes("Mosaicos matemáticos"))) {
          parsed.annex = DEFAULT_INTERNAL_PROMPTS.annex;
        }
        if (parsed?.cutout && (!parsed.cutout.includes("Gemini") || !parsed.cutout.includes("nunca significa SVG"))) {
          parsed.cutout = DEFAULT_INTERNAL_PROMPTS.cutout;
        }
        if (parsed?.readingProfile && /SVG|<svg/i.test(parsed.readingProfile)) parsed.readingProfile = DEFAULT_INTERNAL_PROMPTS.readingProfile;
        if (parsed?.readingIllustration && /SVG|formas SVG|viewBox/i.test(parsed.readingIllustration)) parsed.readingIllustration = DEFAULT_INTERNAL_PROMPTS.readingIllustration;
        localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(parsed));
        return {
          ...DEFAULT_INTERNAL_PROMPTS,
          ...(parsed && typeof parsed === "object" ? parsed : {})
        };
      }
      return { ...DEFAULT_INTERNAL_PROMPTS };
    }
    const raw = localStorage.getItem(PROMPTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INTERNAL_PROMPTS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_INTERNAL_PROMPTS,
      ...(parsed && typeof parsed === "object" ? parsed : {})
    };
  } catch (error) {
    console.warn("[prompts-service] Failed to parse custom prompts from localStorage:", error);
    return { ...DEFAULT_INTERNAL_PROMPTS };
  }
}

export function saveInternalPrompts(prompts = {}) {
  try {
    const sanitized = {};
    Object.keys(DEFAULT_INTERNAL_PROMPTS).forEach((key) => {
      sanitized[key] = String(prompts[key] ?? DEFAULT_INTERNAL_PROMPTS[key] ?? "").trim();
    });
    localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(sanitized));
    localStorage.setItem(PROMPTS_VERSION_KEY, CURRENT_PROMPTS_VERSION);
    window.dispatchEvent(new CustomEvent("cb:prompts-updated", { detail: sanitized }));
    return sanitized;
  } catch (error) {
    console.error("[prompts-service] Failed to save custom prompts:", error);
    throw error;
  }
}

export function resetInternalPrompts() {
  try {
    localStorage.removeItem(PROMPTS_STORAGE_KEY);
    localStorage.setItem(PROMPTS_VERSION_KEY, CURRENT_PROMPTS_VERSION);
    const defaults = { ...DEFAULT_INTERNAL_PROMPTS };
    window.dispatchEvent(new CustomEvent("cb:prompts-updated", { detail: defaults }));
    return defaults;
  } catch (error) {
    console.error("[prompts-service] Failed to reset prompts to default:", error);
    throw error;
  }
}
