/**
 * HABILIDADES COGNITIVAS (Metodología ASC / J. Paul Guilford)
 * Teoría de la Estructura de la Inteligencia (SOI).
 * Tres dimensiones: Proceso + Producto + Contenido -> Código de 3 letras (ej. CUF).
 */

import { escapeHtml } from "./ui-components.js";

export const GUILFORD_PROCESSES = Object.freeze({
  C: {
    code: "C",
    name: "Captación",
    verbPrefix: "Captación de",
    desc: "Recepción, discriminación, identificación y comprensión inicial de la información."
  },
  M: {
    code: "M",
    name: "Memoria",
    verbPrefix: "Memoria de",
    desc: "Retención, almacenamiento y evocación de información aprendida o presentada."
  },
  E: {
    code: "E",
    name: "Evaluación",
    verbPrefix: "Evaluación de",
    desc: "Comparación, juicio crítico, verificación de errores y selección de la opción correcta."
  },
  N: {
    code: "N",
    name: "Producción Convergente",
    subtitle: "Solución de problemas",
    verbPrefix: "Producción convergente de",
    desc: "Deducción lógica, cálculo y resolución de problemas guiados con respuesta unívoca."
  },
  D: {
    code: "D",
    name: "Producción Divergente",
    subtitle: "Creatividad",
    verbPrefix: "Producción divergente de",
    desc: "Generación de múltiples ideas, creación libre, invención y originalidad."
  }
});

export const GUILFORD_PRODUCTS = Object.freeze({
  U: {
    code: "U",
    name: "Unidades",
    gender: "f",
    desc: "Elementos aislados, letras, palabras sueltas, números o figuras individuales."
  },
  C: {
    code: "C",
    name: "Clases",
    gender: "f",
    desc: "Conjuntos, categorías, agrupaciones y clasificación por propiedades comunes."
  },
  R: {
    code: "R",
    name: "Relaciones",
    gender: "f",
    desc: "Conexiones, asociaciones, correspondencias, parejas, analogías o contrastes."
  },
  S: {
    code: "S",
    name: "Sistemas",
    gender: "m",
    desc: "Estructuras complejas organizadas: oraciones, párrafos, lecturas o algoritmos."
  },
  T: {
    code: "T",
    name: "Transformaciones",
    gender: "f",
    desc: "Modificaciones, sustituciones, cambios de forma, reescritura o conversiones."
  },
  I: {
    code: "I",
    name: "Implicaciones",
    gender: "f",
    desc: "Inferencias, conclusiones, predicciones, causas-efectos y extrapolaciones."
  }
});

export const GUILFORD_CONTENTS = Object.freeze({
  F: {
    code: "F",
    name: "Figurativos",
    adjFeminine: "Figurativas",
    adjMasculine: "Figurativos",
    desc: "Información visual concreta: imágenes, formas espaciales, trazos, dibujos, colores."
  },
  S: {
    code: "S",
    name: "Simbólicos",
    adjFeminine: "Simbólicas",
    adjMasculine: "Simbólicos",
    desc: "Signos abstractos y códigos formales: letras, números, símbolos y operaciones."
  },
  M: {
    code: "M",
    name: "Semánticos",
    adjFeminine: "Semánticas",
    adjMasculine: "Semánticos",
    desc: "Significado verbal, ideas, conceptos, comprensión lectora y vocabulario."
  }
});

/**
 * Obtiene el nombre completo de una habilidad a partir de su código de 3 letras.
 * Ej: CUF -> "Captación de Unidades Figurativas"
 */
export function getSkillFullName(code = "") {
  const cleanCode = String(code || "").toUpperCase().trim();
  if (cleanCode.length !== 3) return "Habilidad Cognitiva";

  const pCode = cleanCode[0];
  const rCode = cleanCode[1];
  const cCode = cleanCode[2];

  const process = GUILFORD_PROCESSES[pCode];
  const product = GUILFORD_PRODUCTS[rCode];
  const content = GUILFORD_CONTENTS[cCode];

  if (!process || !product || !content) return cleanCode;

  const adjContent = product.gender === "m" ? content.adjMasculine : content.adjFeminine;
  return `${process.verbPrefix} ${product.name} ${adjContent}`;
}

/**
 * Infiere la habilidad cognitiva más adecuada para un subtema según sus actividades.
 * Analiza el título, consignas, verbos de acción, tipo de contenido y categoría curricular.
 */
export function inferCognitiveSkill(activity = {}, category = "") {
  const title = String(activity.title || activity.subtopic || activity.section || "").toLowerCase();
  const subtopic = String(activity.subtopic || activity.section || "").toLowerCase();
  const cat = String(category || activity.category || "").toLowerCase();
  const cleanText = `${title} ${subtopic} ${String(activity.html || "").replace(/<[^>]+>/g, " ")}`.toLowerCase();

  // 1. DIMENSIÓN DE PROCESO (C, M, E, N, D)
  let processCode = "C"; // Default: Captación (observar, leer, reconocer)
  if (/\b(crea|inventa|imagina|prop[oó]n|dise[ñn]a|redacta\s+libremente|escribe\s+una\s+historia|expresi[oó]n\s+libre|tu\s+propia\s+versi[oó]n|originalidad|artes)\b/i.test(cleanText)) {
    processCode = "D"; // Divergente / Creatividad
  } else if (/\b(resuelve|calcula|soluciona|halla\s+el\s+resultado|cu[aá]nto|cu[aá]ntos|suma|resta|multiplica|divide|operaci[oó]n|completa\s+la\s+serie|sigue\s+el\s+patr[oó]n|deduce|algoritmo|resultado)\b/i.test(cleanText) || cat.includes("matem")) {
    processCode = "N"; // Convergente / Solución de problemas
  } else if (/\b(eval[uú]a|verifica|comprueba|compara|corrige|elige\s+la\s+opci[oó]n|determina\s+si|verdadero\s+o\s+falso|detecta\s+el\s+error|cu[aá]l\s+no\s+pertenece|subraya\s+el\s+error|selecciona\s+la\s+correcta)\b/i.test(cleanText) || subtopic.includes("ortograf")) {
    processCode = "E"; // Evaluación
  } else if (/\b(memoria|memoriza|recuerda|evoca|repite|reproduce|sin\s+ver|qu[eé]\s+hab[ií]a|c[oó]mo\s+era|retenci[oó]n)\b/i.test(cleanText)) {
    processCode = "M"; // Memoria
  } else {
    processCode = "C"; // Captación
  }

  // 2. DIMENSIÓN DE PRODUCTO (U, C, R, S, T, I)
  let productCode = "S"; // Default: Sistemas
  if (/\b(infiere|concluye|qu[eé]\s+pasar[ií]a|predice|consecuencia|moraleja|por\s+qu[eé]\s+ocurri[oó]|deducci[oó]n|anticipa)\b/i.test(cleanText)) {
    productCode = "I"; // Implicaciones
  } else if (/\b(transforma|convierte|cambia|sustituye|reescribe|modifica|traduce|reorganiza|pasa\s+a)\b/i.test(cleanText)) {
    productCode = "T"; // Transformaciones
  } else if (/\b(clasifica|agrupa|conjuntos?|categor[ií]as?|familias\s+de|tipos\s+de|separa\s+por\s+grupos|clasificaci[oó]n)\b/i.test(cleanText)) {
    productCode = "C"; // Clases
  } else if (/\b(une\s+con|relaciona|asocia|correspondencia|parejas|ant[oó]nimos|sin[oó]nimos|opuestos|conecta|flechas|antes\s+y\s+despu[eé]s)\b/i.test(cleanText)) {
    productCode = "R"; // Relaciones
  } else if (/\b(trazo|trazos|letra|grafema|fonema|vocal|consonante|palabra\s+suelta|elemento\s+aislado|figura\s+individual|d[ií]gito)\b/i.test(`${title} ${subtopic}`)) {
    productCode = "U"; // Unidades
  } else {
    productCode = "S"; // Sistemas (oraciones, párrafos, lecturas estructuradas)
  }

  // 3. DIMENSIÓN DE CONTENIDO (F, S, M)
  let contentCode = "M"; // Default: Semántico (lenguaje/significado)
  if (/\b(trazo|trazos|traza|dibuja|colorea|figura|figuras|formas?|imagen|im[aá]genes|ilustraci[oó]n|recorta|recorte|visual|espacial|arte|psicomotricidad|grafomotricidad)\b/i.test(cleanText) || subtopic.includes("trazo") || subtopic.includes("arte")) {
    contentCode = "F"; // Figurativo
  } else if (/\b(matem[aá]ticas?|c[aá]lculo|aritm[eé]tica|n[uú]meros?|d[ií]gitos?|cifras?|operaci[oó]n|operaciones|signos?|c[oó]digos?|ortograf[ií]a|regla\s+ortogr[aá]fica)\b/i.test(cleanText) || cat.includes("matem") || subtopic.includes("ortograf")) {
    contentCode = "S"; // Simbólico
  } else {
    contentCode = "M"; // Semántico
  }

  // Casos específicos emblemáticos
  if (subtopic.includes("trazo") || title.includes("trazo")) {
    processCode = "C";
    productCode = "U";
    contentCode = "F"; // CUF: Captación de Unidades Figurativas
  } else if (subtopic.includes("comprension") || subtopic.includes("lectura")) {
    processCode = "C";
    productCode = "S";
    contentCode = "M"; // CSM: Captación de Sistemas Semánticos
  } else if (cat.includes("matem") && !subtopic.includes("trazo")) {
    processCode = "N";
    productCode = productCode === "U" ? "U" : "S";
    contentCode = "S"; // NSS o NUS
  }

  const code = `${processCode}${productCode}${contentCode}`;
  return {
    code,
    process: GUILFORD_PROCESSES[processCode]?.name || "Captación",
    product: GUILFORD_PRODUCTS[productCode]?.name || "Unidades",
    content: GUILFORD_CONTENTS[contentCode]?.name || "Figurativos",
    fullName: getSkillFullName(code),
    criteria: "Tiempo (T) · Esfuerzo (E) · Precisión (P)"
  };
}

/**
 * Resuelve la habilidad cognitiva de una actividad, respetando valores previamente asignados.
 */
export function resolveActivityCognitiveSkill(activity = {}, category = "") {
  if (activity.cognitiveSkill?.code && activity.cognitiveSkill?.code.length === 3) {
    const code = activity.cognitiveSkill.code.toUpperCase();
    return {
      code,
      process: GUILFORD_PROCESSES[code[0]]?.name || "",
      product: GUILFORD_PRODUCTS[code[1]]?.name || "",
      content: GUILFORD_CONTENTS[code[2]]?.name || "",
      fullName: activity.cognitiveSkill.fullName || getSkillFullName(code),
      criteria: "Tiempo (T) · Esfuerzo (E) · Precisión (P)"
    };
  }

  // Detectar si el agente o el HTML incluyeron data-cognitive-code="XYZ" o [HC: XYZ]
  const rawHtml = String(activity.html || activity.content || "");
  const match = rawHtml.match(/data-cognitive-code=["']([A-Za-z]{3})["']/i) ||
                rawHtml.match(/\[(?:HC|HBC|COGNITIVE):\s*([A-Za-z]{3})\]/i);
  if (match && match[1] && match[1].length === 3) {
    const code = match[1].toUpperCase();
    if (GUILFORD_PROCESSES[code[0]] && GUILFORD_PRODUCTS[code[1]] && GUILFORD_CONTENTS[code[2]]) {
      return {
        code,
        process: GUILFORD_PROCESSES[code[0]]?.name || "",
        product: GUILFORD_PRODUCTS[code[1]]?.name || "",
        content: GUILFORD_CONTENTS[code[2]]?.name || "",
        fullName: getSkillFullName(code),
        criteria: "Tiempo (T) · Esfuerzo (E) · Precisión (P)"
      };
    }
  }

  return inferCognitiveSkill(activity, category);
}

/**
 * Genera el marcado HTML de la etiqueta que se ubica a la derecha de class="cb-activity-title".
 */
export function renderCognitiveBadgeHtml(skill) {
  if (!skill || !skill.code) return "";
  const code = escapeHtml(skill.code);
  const fullName = escapeHtml(skill.fullName || getSkillFullName(skill.code));
  const process = escapeHtml(skill.process || "");
  const product = escapeHtml(skill.product || "");
  const content = escapeHtml(skill.content || "");

  return `
    <span class="cb-cognitive-badge" data-cognitive-badge data-cognitive-code="${code}" aria-label="Habilidad cognitiva: ${fullName} (${code})" tabindex="0">
      <i class="fas fa-brain cb-cognitive-badge-icon" aria-hidden="true"></i>
      <span class="cb-cognitive-badge-code">${code}</span>
      <span class="cb-cognitive-tooltip" role="tooltip">
        <span class="cb-cognitive-tt-header">
          <span class="cb-cognitive-tt-pill">${code}</span>
          <span class="cb-cognitive-tt-title">${fullName}</span>
        </span>
        <span class="cb-cognitive-tt-divider"></span>
        <span class="cb-cognitive-tt-grid">
          <span class="cb-cognitive-tt-row">
            <span class="cb-cognitive-tt-label">1. Proceso:</span>
            <strong class="cb-cognitive-tt-val">${process}</strong>
          </span>
          <span class="cb-cognitive-tt-row">
            <span class="cb-cognitive-tt-label">2. Producto:</span>
            <strong class="cb-cognitive-tt-val">${product}</strong>
          </span>
          <span class="cb-cognitive-tt-row">
            <span class="cb-cognitive-tt-label">3. Contenido:</span>
            <strong class="cb-cognitive-tt-val">${content}</strong>
          </span>
        </span>
        <span class="cb-cognitive-tt-footer">
          <i class="fas fa-bullseye" aria-hidden="true"></i>
          <span>Logro T.E.P.: <strong>Tiempo · Esfuerzo · Precisión</strong></span>
        </span>
        <span class="cb-cognitive-tt-hint">Clic para inspeccionar o cambiar</span>
      </span>
    </span>
  `;
}

/**
 * Modal interactivo para inspeccionar y ajustar la Habilidad Cognitiva del subtema.
 */
export function openCognitiveSkillModal(activity, onSave) {
  const currentSkill = resolveActivityCognitiveSkill(activity);
  let pCode = currentSkill.code[0] || "C";
  let rCode = currentSkill.code[1] || "U";
  let cCode = currentSkill.code[2] || "F";

  const modalId = "cbCognitiveSkillModal";
  document.getElementById(modalId)?.remove();

  const modal = document.createElement("div");
  modal.id = modalId;
  modal.className = "cb-cognitive-modal-overlay";

  const renderContent = () => {
    const currentCode = `${pCode}${rCode}${cCode}`;
    const fullName = getSkillFullName(currentCode);

    return `
      <div class="cb-cognitive-modal-card" role="dialog" aria-labelledby="cbCognitiveModalTitle">
        <header class="cb-cognitive-modal-header">
          <div class="cb-cognitive-modal-header-left">
            <div class="cb-cognitive-modal-icon"><i class="fas fa-brain"></i></div>
            <div>
              <h3 id="cbCognitiveModalTitle" class="cb-cognitive-modal-title">Habilidad Cognitiva (ASC)</h3>
              <p class="cb-cognitive-modal-subtitle">Estructura de la Inteligencia basada en J. Paul Guilford</p>
            </div>
          </div>
          <button type="button" class="cb-cognitive-modal-close" data-close-modal aria-label="Cerrar"><i class="fas fa-times"></i></button>
        </header>

        <div class="cb-cognitive-modal-body">
          <div class="cb-cognitive-preview-card">
            <span class="cb-cognitive-preview-pill">${currentCode}</span>
            <div class="cb-cognitive-preview-info">
              <strong class="cb-cognitive-preview-name">${escapeHtml(fullName)}</strong>
              <span class="cb-cognitive-preview-tep">Logro T.E.P.: <strong>T</strong>iempo · <strong>E</strong>sfuerzo · <strong>P</strong>recisión</span>
            </div>
          </div>

          <!-- Dimension 1: Procesos -->
          <div class="cb-cognitive-dimension-section">
            <label class="cb-cognitive-dim-label">1. Proceso de la Información:</label>
            <div class="cb-cognitive-options-grid" data-dim="process">
              ${Object.values(GUILFORD_PROCESSES).map((item) => `
                <button type="button" class="cb-cognitive-opt-btn ${item.code === pCode ? 'is-selected' : ''}" data-code="${item.code}">
                  <span class="cb-cognitive-opt-code">${item.code}</span>
                  <span class="cb-cognitive-opt-name">${escapeHtml(item.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>

          <!-- Dimension 2: Productos -->
          <div class="cb-cognitive-dimension-section">
            <label class="cb-cognitive-dim-label">2. Producto de la Información:</label>
            <div class="cb-cognitive-options-grid" data-dim="product">
              ${Object.values(GUILFORD_PRODUCTS).map((item) => `
                <button type="button" class="cb-cognitive-opt-btn ${item.code === rCode ? 'is-selected' : ''}" data-code="${item.code}">
                  <span class="cb-cognitive-opt-code">${item.code}</span>
                  <span class="cb-cognitive-opt-name">${escapeHtml(item.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>

          <!-- Dimension 3: Contenidos -->
          <div class="cb-cognitive-dimension-section">
            <label class="cb-cognitive-dim-label">3. Contenido de la Información:</label>
            <div class="cb-cognitive-options-grid" data-dim="content">
              ${Object.values(GUILFORD_CONTENTS).map((item) => `
                <button type="button" class="cb-cognitive-opt-btn ${item.code === cCode ? 'is-selected' : ''}" data-code="${item.code}">
                  <span class="cb-cognitive-opt-code">${item.code}</span>
                  <span class="cb-cognitive-opt-name">${escapeHtml(item.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <footer class="cb-cognitive-modal-footer">
          <button type="button" class="cb-cognitive-btn-cancel" data-close-modal>Cancelar</button>
          <button type="button" class="cb-cognitive-btn-save" data-save-skill>
            <i class="fas fa-check" aria-hidden="true"></i> Guardar Habilidad
          </button>
        </footer>
      </div>
    `;
  };

  modal.innerHTML = renderContent();
  document.body.appendChild(modal);

  const updateModalState = () => {
    modal.innerHTML = renderContent();
    attachListeners();
  };

  const attachListeners = () => {
    modal.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => modal.remove()));
    modal.querySelectorAll("[data-dim='process'] button").forEach((b) => b.addEventListener("click", () => {
      pCode = b.dataset.code;
      updateModalState();
    }));
    modal.querySelectorAll("[data-dim='product'] button").forEach((b) => b.addEventListener("click", () => {
      rCode = b.dataset.code;
      updateModalState();
    }));
    modal.querySelectorAll("[data-dim='content'] button").forEach((b) => b.addEventListener("click", () => {
      cCode = b.dataset.code;
      updateModalState();
    }));
    modal.querySelector("[data-save-skill]")?.addEventListener("click", () => {
      const finalCode = `${pCode}${rCode}${cCode}`;
      const updatedSkill = {
        code: finalCode,
        process: GUILFORD_PROCESSES[pCode]?.name || "",
        product: GUILFORD_PRODUCTS[rCode]?.name || "",
        content: GUILFORD_CONTENTS[cCode]?.name || "",
        fullName: getSkillFullName(finalCode),
        criteria: "Tiempo (T) · Esfuerzo (E) · Precisión (P)"
      };
      activity.cognitiveSkill = updatedSkill;
      onSave?.(updatedSkill);
      modal.remove();
    });
  };

  attachListeners();
}
