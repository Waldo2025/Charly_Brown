function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatText(value = "", fallback = "") {
  const safe = String(value || "").replace(/\s+/g, " ").trim();
  return safe || fallback;
}

function isGenericVideoTitle(value = "") {
  const safe = formatText(value).toLowerCase();
  if (!safe) return true;
  return /^(video|guion de video|video de proyecto|video p\d+\w*|video\s+"?p\d+\w*"?|p\d+\w*)$/i.test(safe);
}

function buildFocusText(activityTitle = "", subtema = "", objetivoT = "") {
  const title = formatText(activityTitle)
    .replace(/\[(?:IC\.?|IC)\s*[^\]]+\]/gi, " ")
    .replace(/\b(?:ve|ver|mira|observa|usa)\b\s+(?:el\s+)?video\b.*$/i, " ")
    .replace(/\bguion de video\b.*$/i, " ")
    .replace(/\bvideo\s+p?\d+\w*\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title) return title;
  const tema = formatText(objetivoT);
  if (tema) return tema;
  return formatText(subtema, "la actividad principal del proyecto");
}

function isGenericProjectFocus(text = "") {
  const safe = formatText(text).toLowerCase();
  if (!safe) return true;
  return /^(proyectos?|proyecto interdisciplinario|actividad principal del proyecto)$/i.test(safe);
}

function countWords(text = "") {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function pickShortFocus(activityTitle = "", subtema = "", objetivoT = "") {
  const source = buildFocusText(activityTitle, subtema, objetivoT);
  const words = source.split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(" ").trim() || "la actividad";
}

function buildReadingBridge(readingTitle = "", readingSummary = "") {
  const title = formatText(readingTitle);
  const summary = formatText(readingSummary);
  const shortSummary = summary.split(/\s+/).slice(0, 10).join(" ").trim();
  if (title && shortSummary) {
    return `la lectura "${title}" sobre ${shortSummary}`;
  }
  if (title) return `la lectura "${title}"`;
  if (shortSummary) return `la lectura sobre ${shortSummary}`;
  return "";
}

function buildReadingShortLabel(readingTitle = "", readingSummary = "") {
  const title = formatText(readingTitle);
  if (title) return "la lectura base";
  const summary = formatText(readingSummary);
  if (!summary) return "";
  return "la lectura detonante";
}

function buildReadingKnowledgeAnchor(readingSummary = "", objectiveT = "", subtema = "") {
  const source = formatText(readingSummary || objectiveT || subtema);
  if (!source) return "la idea central";
  const cleaned = source
    .toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stop = new Set([
    "la", "el", "los", "las", "de", "del", "y", "o", "u", "a", "en", "con", "para", "por",
    "que", "un", "una", "unos", "unas", "se", "su", "sus", "al", "como", "sobre", "desde",
    "proyectos", "proyecto", "actividad", "lectura", "base", "detonante",
    "escuchen", "escucha", "observa", "mira", "ve", "video", "videos", "escuchar", "observen"
  ]);
  const tokens = cleaned.split(" ").filter((word) => word.length >= 4 && !stop.has(word));
  const anchor = tokens.slice(0, 2).join(" ").trim();
  return anchor || "la idea central";
}

function buildActivityActionPhrase(focus = "", fallback = "realizan la actividad") {
  const safe = formatText(focus).toLowerCase();
  if (!safe) return fallback;
  if (/\bcartel\b/.test(safe)) return "presentan su cartel";
  if (/\bnombre|nombres\b/.test(safe) && /\bsonido|sonidos\b/.test(safe)) return "comparan sonidos de nombres";
  if (/\bnombre|nombres\b/.test(safe)) return "presentan sus nombres";
  if (/\bsonido|sonidos\b/.test(safe)) return "escuchan sonidos clave";
  if (/\banimal|animales\b/.test(safe)) return "clasifican animales";
  if (/\bdibujo|dibujos\b/.test(safe)) return "explican su dibujo";
  const words = safe.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return words || fallback;
}

export function buildUnidadVideoPedagogicGuide({
  clave = "",
  subtema = "",
  objetivoT = "",
  objetivoAE = "",
  objetivoP = "",
  activityTitle = "",
  activityText = "",
  readingTitle = "",
  readingSummary = ""
} = {}) {
  const focus = buildFocusText(
    activityTitle,
    isGenericProjectFocus(subtema) ? "" : subtema,
    isGenericProjectFocus(objetivoT) ? "" : objetivoT
  );
  const shortFocus = pickShortFocus(
    activityTitle,
    isGenericProjectFocus(subtema) ? "" : subtema,
    isGenericProjectFocus(objetivoT) ? "" : objetivoT
  );
  const safeClave = isGenericVideoTitle(clave)
    ? formatText(shortFocus, formatText(focus, `Video de ${subtema || "proyecto"}`))
    : formatText(clave, formatText(shortFocus, `Video de ${subtema || "proyecto"}`));
  const aprendizaje = formatText(objetivoAE, `comprender mejor ${focus}`);
  const proceso = formatText(objetivoP, "explicar, modelar y aplicar lo aprendido");
  const readingBridge = buildReadingBridge(readingTitle, readingSummary);
  const readingShortLabel = buildReadingShortLabel(readingTitle, readingSummary);
  const knowledgeAnchor = buildReadingKnowledgeAnchor(activityText || readingSummary, objetivoT, focus);
  const actionPhrase = buildActivityActionPhrase(activityText || focus);
  const scenes = [
    {
      tiempo: "0:00-0:20",
      guion: `¿Qué aprendemos sobre ${knowledgeAnchor}? Este video muestra pistas clave para comprenderlo y aplicarlo hoy.`,
      transicion: "Entrada clara con título, voz cálida y una pregunta guía.",
      visual: `Portada con el título del video, una ilustración de ${focus} y la pregunta detonadora.`
    },
    {
      tiempo: "0:20-0:50",
      guion: `Explica cómo reconocer ${knowledgeAnchor} mientras ${actionPhrase} con ejemplos breves, claros y cercanos.`,
      transicion: "Cambio a explicación guiada con ejemplos simples.",
      visual: "Secuencia de ejemplos, palabras clave resaltadas y apoyo visual que muestre qué observar."
    },
    {
      tiempo: "0:50-1:20",
      guion: `Modela cómo aplicar ${knowledgeAnchor} cuando ${actionPhrase} y muestra un ejemplo listo para imitar.`,
      transicion: "Paso de explicación a demostración práctica.",
      visual: "Escena modelada del trabajo del alumno, con flechas, recuadros o comparaciones antes/después."
    },
    {
      tiempo: "1:20-1:45",
      guion: `Cierra retomando ${knowledgeAnchor}, resume ${actionPhrase} y propone un reto breve para practicarlo hoy.`,
      transicion: "Cierre con síntesis y llamado a la acción.",
      visual: `Producto final, checklist breve de aplicación y mensaje de cierre conectado con ${focus}.`
    }
  ];

  return {
    title: `Guion de video: "${safeClave}"`,
    sentence: `observa el video "${safeClave}" para descubrir una idea útil sobre ${focus} y úsala para mejorar tu trabajo`,
    substepIntro: `Observa el video "${safeClave}" y relaciónalo directamente con ${focus}${readingBridge ? ` y con ${readingBridge}` : ""}.`,
    substepPoints: [
      `Identifica cómo el video explica o modela ${focus}${readingBridge ? ` a partir de ${readingBridge}` : ""}.`,
      `Anota una idea, ejemplo o consejo del video que te ayude a comprender mejor la actividad.`,
      `Aplica esa idea a tu propia producción y explica qué cambió o mejoró en tu trabajo.`
    ],
    answer: `Se espera que el alumno recupere una idea concreta del video sobre ${focus}, la conecte con ${aprendizaje} y la use para fortalecer su propia producción.`,
    scenes: scenes.map((scene) => ({
      ...scene,
      guionWords: countWords(scene.guion)
    })).map(({ guionWords, ...scene }) => scene)
  };
}

export const buildProyectoVideoPedagogicGuide = buildUnidadVideoPedagogicGuide;

function buildActivityBlock({ index = 1, title = "", steps = [] } = {}) {
  const safeTitle = formatText(title, `Actividad ${index}`);
  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  return `
    <div class="activity">
      <p>${index}. <strong>${escapeHtml(safeTitle)}</strong> [IC T. IND]</p>
      <ol class="steps steps-numbered">
        ${safeSteps.map((step) => `
          <li>
            ${escapeHtml(formatText(step.text, "Completa la consigna."))}
            <div class="answer"><span style="color:mediumvioletred;">Respuesta: ${escapeHtml(formatText(step.answer, "Evidencia breve y correcta del trabajo realizado."))}</span></div>
          </li>
        `).join("")}
      </ol>
    </div>
  `.trim();
}

function buildFichaFallback({
  clave = "",
  subtema = "",
  categoria = "",
  grado = "",
  objetivoT = "",
  objetivoAE = "",
  objetivoC = ""
} = {}) {
  const tema = formatText(objetivoT, formatText(subtema, "el proyecto"));
  const aprendizaje = formatText(objetivoAE, "el aprendizaje esperado del proyecto");
  const contenido = formatText(objetivoC, "los contenidos del proyecto");
  return `
    <section data-resource-section="true" data-resource-type="ficha" class="resource-ficha">
      <h3 class="unidad-ficha-heading">${escapeHtml(formatText(clave, "Ficha de refuerzo"))}</h3>
      <p><strong>Propósito:</strong> reforzar ${escapeHtml(tema)} en ${escapeHtml(grado)} con actividades breves, graduales y vinculadas a ${escapeHtml(categoria || "la categoría")}.</p>
      ${buildActivityBlock({
        index: 1,
        title: `Reconoce ideas clave de ${tema}`,
        steps: [
          { text: `Observa las palabras o imágenes relacionadas con ${tema}.`, answer: `Identifica al menos 3 elementos vinculados con ${tema}.` },
          { text: `Relaciona cada elemento con una idea del proyecto.`, answer: `Une correctamente cada elemento con una idea principal.` },
          { text: `Explica cuál te ayuda más a comprender el tema.`, answer: `Da una explicación simple y coherente.` }
        ]
      })}
      ${buildActivityBlock({
        index: 2,
        title: `Aplica ${aprendizaje}`,
        steps: [
          { text: `Lee el caso breve o ejemplo de la ficha.`, answer: `Reconoce la situación planteada.` },
          { text: `Escribe o señala la acción correcta según lo aprendido.`, answer: `Responde con una acción pertinente al aprendizaje esperado.` },
          { text: `Compara tu respuesta con el propósito del proyecto.`, answer: `Menciona una coincidencia clara.` }
        ]
      })}
      ${buildActivityBlock({
        index: 3,
        title: `Organiza información sobre ${contenido}`,
        steps: [
          { text: `Clasifica la información en dos o tres grupos.`, answer: `Agrupa la información con un criterio lógico.` },
          { text: `Coloca un título breve a cada grupo.`, answer: `Escribe títulos claros y pertinentes.` },
          { text: `Marca cuál grupo es más importante para el proyecto.`, answer: `Selecciona y justifica el grupo principal.` }
        ]
      })}
      ${buildActivityBlock({
        index: 4,
        title: `Comprueba lo aprendido en ${subtema || "el proyecto"}`,
        steps: [
          { text: `Resuelve la consigna final de la ficha.`, answer: `Presenta una solución completa y ordenada.` },
          { text: `Revisa si tu respuesta usa ideas del proyecto.`, answer: `Confirma la relación con el tema trabajado.` },
          { text: `Comparte una mejora posible para tu producto.`, answer: `Propone una mejora concreta.` }
        ]
      })}
    </section>
  `.trim();
}

function buildAnexoFallback({ clave = "", subtema = "", objetivoT = "", objetivoAE = "", objetivoC = "" } = {}) {
  const tema = formatText(objetivoT, formatText(subtema, "el proyecto"));
  const aprendizaje = formatText(objetivoAE, "el aprendizaje esperado");
  const contenido = formatText(objetivoC, "los contenidos clave");
  return `
    <section data-resource-section="true" data-resource-type="anexo" class="resource-anexo">
      <h3 class="unidad-anexo-heading">${escapeHtml(formatText(clave, "Anexo visual"))}</h3>
      <p><strong>Uso sugerido:</strong> consulta visual para reforzar ${escapeHtml(tema)} antes, durante o después del proyecto.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th>Elemento visual</th>
            <th>Descripción breve</th>
            <th>Relación con el proyecto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Idea central</td>
            <td>${escapeHtml(tema)}</td>
            <td>Resume el eje principal del proyecto.</td>
          </tr>
          <tr>
            <td>Aprendizaje esperado</td>
            <td>${escapeHtml(aprendizaje)}</td>
            <td>Orienta lo que el alumnado debe lograr.</td>
          </tr>
          <tr>
            <td>Contenido clave</td>
            <td>${escapeHtml(contenido)}</td>
            <td>Funciona como apoyo de consulta permanente.</td>
          </tr>
        </tbody>
      </table>
      <p><strong>Referencia visual:</strong> usa íconos, colores suaves, flechas o recuadros para distinguir conceptos, ejemplos y recordatorios importantes.</p>
    </section>
  `.trim();
}

function buildRecortableFallback({ clave = "", subtema = "", objetivoT = "", objetivoC = "" } = {}) {
  const tema = formatText(objetivoT, formatText(subtema, "el proyecto"));
  const contenido = formatText(objetivoC, "las ideas principales");
  const pieces = [
    { title: "Tarjeta 1", detail: `Concepto principal sobre ${tema}.` },
    { title: "Tarjeta 2", detail: `Ejemplo visual relacionado con ${contenido}.` },
    { title: "Tarjeta 3", detail: `Situación o caso breve para clasificar.` },
    { title: "Tarjeta 4", detail: `Conclusión o mensaje final del proyecto.` }
  ];
  return `
    <section data-resource-section="true" data-resource-type="recortable" class="resource-recortable">
      <h3 class="unidad-recortable-heading">${escapeHtml(formatText(clave, "Recortable"))}</h3>
      <p><strong>Descripción general:</strong> recortable manipulativo para organizar visualmente ideas sobre ${escapeHtml(tema)}.</p>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px;">
        ${pieces.map((piece) => `
          <div style="border:1.5px dashed #f59e0b;border-radius:12px;padding:12px;background:#fffaf0;">
            <p style="margin:0 0 6px 0;font-weight:800;">${escapeHtml(piece.title)}</p>
            <p style="margin:0;">${escapeHtml(piece.detail)}</p>
          </div>
        `).join("")}
      </div>
      <p><strong>Indicaciones de armado:</strong> imprimir, recortar por las líneas punteadas, clasificar las piezas y pegarlas según el orden o la relación que pida la actividad del proyecto.</p>
    </section>
  `.trim();
}

function buildVideoFallback({ clave = "", subtema = "", objetivoT = "", objetivoAE = "", objetivoP = "", activityTitle = "", activityText = "", readingTitle = "", readingSummary = "" } = {}) {
  const guide = buildUnidadVideoPedagogicGuide({
    clave,
    subtema,
    objetivoT,
    objetivoAE,
    objetivoP,
    activityTitle,
    activityText,
    readingTitle,
    readingSummary
  });
  const purposeFocus = buildFocusText(activityTitle, subtema, objetivoT);
  const purposeReading = buildReadingShortLabel(readingTitle, readingSummary);
  return `
    <section data-resource-section="true" data-resource-type="video" class="resource-video">
      <h3 class="unidad-video-heading">${escapeHtml(guide.title)}</h3>
      <p><strong>Propósito del video:</strong> ampliar la comprensión de ${escapeHtml(purposeFocus)}${purposeReading ? ` desde ${escapeHtml(purposeReading)}` : ""}, modelar una idea clave y apoyar la actividad del alumnado.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th>Tiempo</th>
            <th>Guion</th>
            <th>Transición</th>
            <th>Elemento visual</th>
          </tr>
        </thead>
        <tbody>
          ${guide.scenes.map((scene) => `
            <tr>
              <td>${escapeHtml(scene.tiempo)}</td>
              <td>${escapeHtml(scene.guion)}</td>
              <td>${escapeHtml(scene.transicion)}</td>
              <td>${escapeHtml(scene.visual)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `.trim();
}

export function buildProyectoResourceFallbackHtml({
  type = "",
  clave = "",
  subtema = "",
  categoria = "",
  grado = "",
  objetivoT = "",
  objetivoAE = "",
  objetivoC = "",
  objetivoP = "",
  activityTitle = "",
  activityText = "",
  readingTitle = "",
  readingSummary = ""
} = {}) {
  const safeType = String(type || "").trim().toLowerCase();
  if (safeType === "ficha") {
    return buildFichaFallback({ clave, subtema, categoria, grado, objetivoT, objetivoAE, objetivoC });
  }
  if (safeType === "anexo") {
    return buildAnexoFallback({ clave, subtema, objetivoT, objetivoAE, objetivoC });
  }
  if (safeType === "recortable") {
    return buildRecortableFallback({ clave, subtema, objetivoT, objetivoC });
  }
  if (safeType === "video") {
    return buildVideoFallback({ clave, subtema, objetivoT, objetivoAE, objetivoP, activityTitle, activityText, readingTitle, readingSummary });
  }
  return "";
}
