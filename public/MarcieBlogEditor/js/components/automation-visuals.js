/**
 * @file automation-visuals.js
 * Sistema de visuales dinámicos y animación orbital 3D contextual por etapa
 * para la experiencia de producción automatizada de Marcie.
 */

export const STAGE_VISUAL_CONFIG = {
  proposals: {
    id: "proposals",
    name: "Búsqueda & Enfoques",
    themeColor: "cyan",
    ambientHalo: "radial-gradient(circle, rgba(66, 217, 220, 0.25) 0%, rgba(255, 112, 183, 0.15) 50%, transparent 70%)",
    orbitRingColor: "rgba(66, 217, 220, 0.38)",
    items: [
      {
        id: "search",
        icon: `<svg class="h-6 w-6 text-cyan-500 drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
        orbitRadiusX: 108,
        orbitRadiusY: 52,
        speed: 9500,
        initialAngle: 0
      },
      {
        id: "sources",
        icon: `<svg class="h-6 w-6 text-indigo-500 drop-shadow-[0_2px_8px_rgba(99,102,241,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
        orbitRadiusX: 114,
        orbitRadiusY: 56,
        speed: 11000,
        initialAngle: 90
      },
      {
        id: "web",
        icon: `<svg class="h-6 w-6 text-teal-400 drop-shadow-[0_2px_8px_rgba(20,184,166,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>`,
        orbitRadiusX: 98,
        orbitRadiusY: 46,
        speed: 8800,
        initialAngle: 180
      },
      {
        id: "ideas",
        icon: `<svg class="h-6 w-6 text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>`,
        orbitRadiusX: 104,
        orbitRadiusY: 50,
        speed: 10200,
        initialAngle: 270
      }
    ]
  },
  articles: {
    id: "articles",
    name: "Redacción & Desarrollo",
    themeColor: "indigo",
    ambientHalo: "radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(236, 72, 153, 0.15) 50%, transparent 70%)",
    orbitRingColor: "rgba(99, 102, 241, 0.38)",
    items: [
      {
        id: "pencil",
        icon: `<svg class="h-6 w-6 text-indigo-500 drop-shadow-[0_2px_8px_rgba(99,102,241,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`,
        orbitRadiusX: 112,
        orbitRadiusY: 54,
        speed: 9200,
        initialAngle: 0
      },
      {
        id: "pages",
        icon: `<svg class="h-6 w-6 text-violet-500 drop-shadow-[0_2px_8px_rgba(139,92,246,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
        orbitRadiusX: 102,
        orbitRadiusY: 48,
        speed: 10500,
        initialAngle: 90
      },
      {
        id: "eraser",
        icon: `<svg class="h-6 w-6 text-rose-500 drop-shadow-[0_2px_8px_rgba(244,63,94,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7ZM18 11l-5.6-5.6M2 21h20"/></svg>`,
        orbitRadiusX: 116,
        orbitRadiusY: 55,
        speed: 8700,
        initialAngle: 180
      },
      {
        id: "quotes",
        icon: `<svg class="h-6 w-6 text-sky-400 drop-shadow-[0_2px_8px_rgba(56,189,248,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>`,
        orbitRadiusX: 96,
        orbitRadiusY: 44,
        speed: 11200,
        initialAngle: 270
      }
    ]
  },
  covers: {
    id: "covers",
    name: "Diseño & Portadas",
    themeColor: "pink",
    ambientHalo: "radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, rgba(168, 85, 247, 0.2) 50%, transparent 70%)",
    orbitRingColor: "rgba(236, 72, 153, 0.38)",
    items: [
      {
        id: "palette",
        icon: `<svg class="h-6 w-6 text-pink-500 drop-shadow-[0_2px_8px_rgba(236,72,153,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M7 21a4 4 0 01-4-4 5 5 0 015-5 4 4 0 014 4 4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>`,
        orbitRadiusX: 110,
        orbitRadiusY: 52,
        speed: 9600,
        initialAngle: 0
      },
      {
        id: "frame",
        icon: `<svg class="h-6 w-6 text-purple-500 drop-shadow-[0_2px_8px_rgba(168,85,247,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
        orbitRadiusX: 115,
        orbitRadiusY: 55,
        speed: 10400,
        initialAngle: 90
      },
      {
        id: "sparkles",
        icon: `<svg class="h-6 w-6 text-fuchsia-400 drop-shadow-[0_2px_8px_rgba(232,121,249,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>`,
        orbitRadiusX: 100,
        orbitRadiusY: 46,
        speed: 8900,
        initialAngle: 180
      },
      {
        id: "camera",
        icon: `<svg class="h-6 w-6 text-rose-400 drop-shadow-[0_2px_8px_rgba(251,113,133,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
        orbitRadiusX: 105,
        orbitRadiusY: 49,
        speed: 11500,
        initialAngle: 270
      }
    ]
  },
  review: {
    id: "review",
    name: "Auditoría & SEO",
    themeColor: "emerald",
    ambientHalo: "radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(6, 182, 212, 0.2) 50%, transparent 70%)",
    orbitRingColor: "rgba(16, 185, 129, 0.38)",
    items: [
      {
        id: "shield",
        icon: `<svg class="h-6 w-6 text-emerald-500 drop-shadow-[0_2px_8px_rgba(16,185,129,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
        orbitRadiusX: 110,
        orbitRadiusY: 53,
        speed: 9800,
        initialAngle: 0
      },
      {
        id: "chart",
        icon: `<svg class="h-6 w-6 text-teal-500 drop-shadow-[0_2px_8px_rgba(20,184,166,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
        orbitRadiusX: 118,
        orbitRadiusY: 56,
        speed: 10800,
        initialAngle: 90
      },
      {
        id: "seo",
        icon: `<svg class="h-6 w-6 text-cyan-400 drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`,
        orbitRadiusX: 98,
        orbitRadiusY: 46,
        speed: 9100,
        initialAngle: 180
      },
      {
        id: "target",
        icon: `<svg class="h-6 w-6 text-amber-500 drop-shadow-[0_2px_8px_rgba(245,158,11,0.4)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
        orbitRadiusX: 105,
        orbitRadiusY: 50,
        speed: 11400,
        initialAngle: 270
      }
    ]
  },
  corrections: {
    id: "corrections",
    name: "Pulido & Empaquetado",
    themeColor: "purple",
    ambientHalo: "radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, rgba(236, 72, 153, 0.22) 50%, transparent 70%)",
    orbitRingColor: "rgba(168, 85, 247, 0.45)",
    items: [
      {
        id: "diamond",
        icon: `<svg class="h-6 w-6 text-purple-500 drop-shadow-[0_2px_8px_rgba(168,85,247,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
        orbitRadiusX: 114,
        orbitRadiusY: 54,
        speed: 8500,
        initialAngle: 0
      },
      {
        id: "wand",
        icon: `<svg class="h-6 w-6 text-fuchsia-400 drop-shadow-[0_2px_8px_rgba(232,121,249,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>`,
        orbitRadiusX: 108,
        orbitRadiusY: 50,
        speed: 9800,
        initialAngle: 90
      },
      {
        id: "ready",
        icon: `<svg class="h-6 w-6 text-emerald-400 drop-shadow-[0_2px_8px_rgba(52,211,153,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7"/></svg>`,
        orbitRadiusX: 100,
        orbitRadiusY: 46,
        speed: 8200,
        initialAngle: 180
      },
      {
        id: "sparkles2",
        icon: `<svg class="h-6 w-6 text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
        orbitRadiusX: 112,
        orbitRadiusY: 52,
        speed: 10500,
        initialAngle: 270
      }
    ]
  }
};

let activeStageKey = null;
let activeItemElements = [];

/**
 * Crea el contenedor HTML para los elementos orbitales dinámicos
 */
export function buildStageVisualHtml(stageKey = "proposals") {
  const config = STAGE_VISUAL_CONFIG[stageKey] || STAGE_VISUAL_CONFIG.proposals;

  return `
    <div class="automation-stage-dynamic-container" data-stage-visuals-root="${config.id}">
      <!-- Halo ambiental de iluminación -->
      <div class="automation-stage-ambient-halo"></div>

      <!-- Anillos orbitales sutiles -->
      <div class="automation-stage-orbit-ring is-primary"></div>
      <div class="automation-stage-orbit-ring is-secondary"></div>

      <!-- Contenedor de elementos orbitales 3D (sólo iconos flotando y girando) -->
      <div class="automation-stage-orbit-layer" data-orbit-layer>
        ${config.items.map((item, idx) => `
          <div class="automation-orbit-item" 
               data-orbit-item-id="${item.id}"
               data-orbit-idx="${idx}"
               >
            <span class="automation-orbit-icon">${item.icon}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/**
 * Inicia la animación orbital 3D matemática y suave de los elementos de la etapa
 */
export function startStageOrbitalAnimation(rootElement, stageKey = "proposals", animateFunc = null) {
  stopStageOrbitalAnimation();
  if (!rootElement) return;

  const config = STAGE_VISUAL_CONFIG[stageKey] || STAGE_VISUAL_CONFIG.proposals;
  activeStageKey = stageKey;

  const container = rootElement.querySelector("[data-orbit-layer]");
  if (!container) return;

  const itemNodes = Array.from(container.querySelectorAll(".automation-orbit-item"));
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  activeItemElements = itemNodes.map((el, index) => {
    const item = config.items[index] || config.items[0];
    if (reducedMotion || !el.animate) {
      el.classList.add("is-static");
      return { el, animation: null };
    }
    const keyframes = Array.from({ length: 17 }, (_, step) => {
      const angle = (step / 16) * Math.PI * 2;
      const depth = (Math.sin(angle) + 1) / 2;
      return {
        offset: step / 16,
        transform: `translate3d(${(Math.cos(angle) * item.orbitRadiusX).toFixed(1)}px, ${(Math.sin(angle) * item.orbitRadiusY).toFixed(1)}px, 0) scale(${(0.78 + depth * 0.38).toFixed(3)})`,
        opacity: 0.62 + depth * 0.38,
        zIndex: Math.sin(angle) > 0 ? 6 : 2
      };
    });
    const animation = el.animate(keyframes, { duration: item.speed, iterations: Infinity, easing: "linear", delay: -(item.initialAngle / 360) * item.speed });
    return { el, animation };
  });
}

/**
 * Detiene las animaciones de la órbita activa
 */
export function stopStageOrbitalAnimation() {
  activeItemElements.forEach((item) => item.animation?.cancel());
  activeItemElements = [];
}

/**
 * Transiciona suavemente el contenedor visual a una nueva etapa
 */
export function transitionToStageVisuals(rootElement, newStageKey, animateFunc = null) {
  if (!rootElement || newStageKey === activeStageKey) return;
  const config = STAGE_VISUAL_CONFIG[newStageKey];
  if (!config) return;

  const oldVisualContainer = rootElement.querySelector("[data-stage-visuals-root]");
  if (!oldVisualContainer) {
    const visualHost = rootElement.querySelector(".automation-agent-visual");
    if (visualHost) {
      visualHost.insertAdjacentHTML("afterbegin", buildStageVisualHtml(newStageKey));
      startStageOrbitalAnimation(rootElement, newStageKey, animateFunc);
    }
    return;
  }

  // Transición: Salida suave de elementos actuales
  const oldItems = oldVisualContainer.querySelectorAll(".automation-orbit-item");
  if (oldItems.length && oldVisualContainer.animate) {
    const exit = oldVisualContainer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    exit.finished.then(() => {
      stopStageOrbitalAnimation();
      oldVisualContainer.outerHTML = buildStageVisualHtml(newStageKey);
      startStageOrbitalAnimation(rootElement, newStageKey, animateFunc);
    }).catch(() => {});
  } else {
    stopStageOrbitalAnimation();
    oldVisualContainer.outerHTML = buildStageVisualHtml(newStageKey);
    startStageOrbitalAnimation(rootElement, newStageKey, animateFunc);
  }
}
