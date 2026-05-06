function normalize(value = "") {
  return String(value || "").trim();
}

export function buildUnidadLengthGuidance({
  grado = "",
  nivel = "",
  instruccionesAdicionales = "",
  isTrazosDeLetras = false
} = {}) {
  const safeGrado = normalize(grado);
  const safeNivel = normalize(nivel);
  const preface = instruccionesAdicionales
    ? `📌 INSTRUCCIÓN ESPECÍFICA DEL USUARIO (OBLIGATORIA):
    ${instruccionesAdicionales}
    
    IMPORTANTE: Esta instrucción tiene PRIORIDAD sobre cualquier otra regla del prompt.
    `
    : "";
  const reminder = instruccionesAdicionales
    ? `⚡ RECORDATORIO CRÍTICO: DEBES SEGUIR LA INSTRUCCIÓN ESPECÍFICA DEL USUARIO:
    "${instruccionesAdicionales}"
    Esta instrucción anula cualquier conflicto con otras reglas.`
    : "";

  return `
    ${preface}
    
    IMPORTANTE: Para ${safeGrado}° grado de ${safeNivel}, ajusta la longitud de las actividades:
    ${safeGrado === "Primero"
      ? "- Instrucciones MUY cortas y simples (máximo 40-60 palabras por actividad)"
      : safeGrado === "Segundo"
        ? "- Instrucciones cortas (máximo 40-50 palabras por actividad)"
        : safeGrado === "Tercero"
          ? "- Instrucciones moderadas (máximo 50-60 palabras por actividad)"
          : safeGrado === "Cuarto"
            ? "- Instrucciones más desarrolladas (máximo 60-70 palabras por actividad)"
            : safeGrado === "Quinto"
              ? "- Instrucciones completas (máximo 70-80 palabras por actividad)"
              : "- Instrucciones detalladas (máximo 80-90 palabras por actividad)"
    }
    ${["Primero", "Segundo"].includes(safeGrado)
      ? "- Usa lenguaje simple, concreto y familiar para niños pequeños"
      : "- Puedes usar vocabulario progresivamente más complejo"
    }
    ${["Primero", "Segundo", "Tercero"].includes(safeGrado) ? "- Cada subinstrucción debe ser breve: una sola idea y pocas palabras." : ""}
    ${safeGrado === "Primero" ? "- En Primero, prioriza subinstrucciones de 4 a 8 palabras." : safeGrado === "Segundo" ? "- En Segundo, prioriza subinstrucciones de 5 a 9 palabras." : safeGrado === "Tercero" ? "- En Tercero, prioriza subinstrucciones de 6 a 10 palabras." : ""}
    ${isTrazosDeLetras
      ? "- Para Trazos de letras no uses subactividades ni pasos internos; usa solo una instrucción directa con modelo o espacio de escritura."
      : `- En formato ASC, cada actividad debe incluir normalmente entre 3 y 4 subactividades útiles.
    - Solo permite 2 subactividades si la actividad es realmente muy simple y sigue siendo pedagógicamente suficiente.
    - Evita actividades con una sola subinstrucción salvo casos excepcionales.`}
    
    ${reminder}
  `;
}

export function buildUnidadActivityStructureContract({
  isTrazosDeLetras = false,
  hasExplicitFormatContract = false
} = {}) {
  if (isTrazosDeLetras) {
    return `
    ESTRUCTURA OBLIGATORIA PARA TRAZOS DE LETRAS:
    <div class="activity">
      <p>1. <strong>[Instrucción breve de trazo o copia].</strong> [IC T. IND]</p>
      <div class="answer"><span style="color:mediumvioletred;">Respuesta: [modelo de letra, sílaba o frase para trazar]</span></div>
    </div>
    - NO uses listas internas, subinstrucciones ni pasos numerados dentro de la actividad.
    - Cada actividad debe mostrar directamente el modelo de escritura en la respuesta esperada.
    `;
  }
  if (hasExplicitFormatContract) {
    return `
    ESTRUCTURA BASE OBLIGATORIA POR ACTIVIDAD NORMAL:
    - Cada actividad debe ir dentro de <div class="activity">.
    - La estructura interna de cada actividad debe seguir el CONTRATO DE FORMATO indicado en las instrucciones específicas del usuario.
    - Si el contrato alternativo no es ASC, evita el molde clásico de subinstrucciones a), b), c), d) con bloque final "Respuesta:".
    - Si el contrato alternativo sí es ASC, conserva exactamente la secuencia original: instrucción principal + subinstrucciones NUMERADAS 1, 2, 3...
    - Si el contrato alternativo sí es ASC, genera normalmente 3 o 4 subinstrucciones por actividad. No reduzcas todo a una sola.
    - En formato ASC, cada subinstrucción debe llevar inmediatamente debajo su propia respuesta o evidencia esperada dentro de <div class="answer">...</div>. No coloques una sola respuesta global al final si existen varias subinstrucciones.
    `;
  }
  return `
    ESTRUCTURA OBLIGATORIA POR ACTIVIDAD NORMAL:
    <div class="activity">
      <p>1. <strong>[Instrucción principal clara y exigente].</strong> [IC T. IND]</p>
      <ol class="steps steps-numbered">
        <li>[Subactividad 1]<div class="answer"><span style="color:mediumvioletred;">Respuesta: [respuesta de la subactividad 1]</span></div></li>
        <li>[Subactividad 2 opcional]<div class="answer"><span style="color:mediumvioletred;">Respuesta: [respuesta de la subactividad 2]</span></div></li>
        <li>[Subactividad 3 opcional]<div class="answer"><span style="color:mediumvioletred;">Respuesta: [respuesta de la subactividad 3]</span></div></li>
        <li>[Subactividad 4 opcional]<div class="answer"><span style="color:mediumvioletred;">Respuesta: [respuesta de la subactividad 4]</span></div></li>
      </ol>
    </div>
    - Regla obligatoria: genera normalmente 3 o 4 subinstrucciones por actividad; evita dejar una sola salvo que el usuario lo haya pedido explícitamente.
    `;
}

export function buildUnidadPrimerIconographyPrompt(grado = "") {
  if (normalize(grado) !== "Primero") return "";
  return `
    ICONOGRAFÍA TEXTUAL PARA PRIMERO:
    - Solo para Primero, sustituye dentro de la instrucción la palabra de acción correspondiente por su clave textual de iconografía nivel 1 cuando exista coincidencia exacta.
    - Ejemplos válidos: [IC OBSERVA], [IC ESCRIBE], [IC ENCUENTRA], [IC LEE], [IC COLOREA GENERICO].
    - Usa la clave textual en lugar de la palabra, no insertes imágenes ni expliques la sustitución.
    - No inventes claves; usa únicamente claves estándar de nivel 1.
  `;
}

export function buildUnidadResourceExtraBlocks({
  recursos = {},
  separarSeccionesRecursos = false,
  isTrazosDeLetras = false,
  hasTrazosStyle = false
} = {}) {
  const safeResources = recursos || {};
  const shouldUseTrazosFichaFormat = !!isTrazosDeLetras || !!hasTrazosStyle;
  let extraBloquesFinales = "";

  if (separarSeccionesRecursos && safeResources?.fichas?.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: genera EXACTAMENTE 1 sección de ficha de refuerzo con clave <strong>${safeResources.fichas.clave}</strong>.
      - La ficha debe ser una sección independiente, no una actividad mezclada con el subtema principal.
      - Usa un bloque HTML completo y marcado con data-resource-section="true" data-resource-type="ficha".
      - La ficha debe mantener coherencia pedagógica y contener 4 actividades internas si corresponde.
      - REGLA CRÍTICA: Las actividades de la ficha deben ser DIFERENTES y COMPLEMENTARIAS a las del proyecto o subtema principal. No repitas las mismas consignas.
      - PROHIBIDO incluir actividades normales del subtema fuera de este bloque de ficha.
      ${shouldUseTrazosFichaFormat ? `- Como este bloque usa formato Trazos y letras, cada actividad de ficha debe incluir SOLO:
        1) instrucción principal en negritas,
        2) modalidad [IC T. IND] / [IC T. PAR] / [IC T. EQUI],
        3) bloque <div class="answer"> con el modelo exacto a trazar o copiar.
      - NO uses subactividades, listas <ol>/<ul>, pasos internos ni viñetas.
      - Deben ser exactamente 4 instrucciones simples con su answer correspondiente.` : `- Cada actividad de ficha debe incluir:
        1) instrucción principal en negritas,
        2) de 1 a 4 subactividades útiles,
        3) modalidad [IC T. IND] / [IC T. PAR] / [IC T. EQUI],
        4) respuesta esperada concreta en magenta.`}
      `;
  }

  if (separarSeccionesRecursos && safeResources?.anexos?.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 sección de anexo visual:
      - Clave: <strong>${safeResources.anexos.clave}</strong>
      - Formato: bloque independiente con data-resource-section="true" data-resource-type="anexo"
      - Descripción visual detallada para reforzar el conocimiento del subtema.
      - El anexo es material de CONSULTA. PROHIBIDO incluir actividades, preguntas, ejercicios o tareas para el alumno dentro de este bloque.
      - Puede ser tablas comparativas, esquemas, mapas conceptuales, etc.
      - NO OMITIR ESTO BAJO NINGUNA CIRCUNSTANCIA
      - No insertes bloques con la clase "activity" ni respuestas en color magenta dentro de esta sección.
    `;
  }

  if (separarSeccionesRecursos && safeResources?.videos?.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar **exactamente UNA sección de guion de video al final del subtema o proyecto**.
      - El video "${safeResources.videos.clave}" no debe quedar dentro de una actividad normal.
      - Debe presentarse como una sección independiente con data-resource-section="true" data-resource-type="video".
      - El guion NO puede ser genérico ni hablar sobre "el proyecto" o "las fases del proyecto" de forma abstracta.
      - El video debe enseñar o modelar una acción, habilidad o producto concreto que el alumnado realizará en una actividad real.
      - Si la actividad trabaja cartel, presentación oral, nombres, sonidos, clasificación, explicación o dibujo, el video debe centrarse en eso mismo.
      - El título y cada escena deben sonar únicos para el contenido real; evita nombres de clave como p1a, p1b o similares.
      - El guion de video es una herramienta de exposición. PROHIBIDO incluir actividades, preguntas o ejercicios dentro del guion.
      - No insertes bloques con la clase "activity" ni respuestas en color magenta dentro de esta sección.
      - Estructura el guion en una tabla HTML con columnas: Tiempo, Guion, Transición, Elemento visual.
      - REGLA ESTRICTA PARA LA COLUMNA "Guion": cada escena debe escribirse como UNA frase completa, natural y cerrada.
      - Cada frase de la columna "Guion" debe tener entre 14 y 17 palabras máximo.
      - NO cortes frases a la mitad, NO uses fragmentos telegráficos y NO metas dos oraciones en la misma celda.
      - Si una idea necesita más espacio, distribúyela en otra escena; no alargues la frase.
    `;
  }

  if (separarSeccionesRecursos && safeResources?.recortables?.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 sección de recortable:
      - Clave: <strong>${safeResources.recortables.clave}</strong>
      - Formato: bloque independiente con data-resource-section="true" data-resource-type="recortable"
      - Descripción visual completa de la sección recortable.
      - El recortable es material FÍSICO. PROHIBIDO incluir actividades, preguntas o tareas dentro de la descripción del recortable.
      - Describe detalladamente cada tarjeta, imagen, pieza, color, texto, forma y tamaño.
    `;
  }

  return extraBloquesFinales;
}
