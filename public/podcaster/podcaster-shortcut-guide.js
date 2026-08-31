export const SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY = "cb_snoopy_shortcut_guide_seen_v1";
export const SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS = 4500;

export const SNOOPY_SHORTCUT_GUIDE_ITEMS = Object.freeze([
  Object.freeze({
    id: "jump",
    icon: "fas fa-location-arrow",
    title: "Salta directo a una escena",
    description: "Escribe el número de escena y el timeline se desplazará hasta ella.",
    combos: Object.freeze([["mod", "J"]])
  }),
  Object.freeze({
    id: "replace",
    icon: "fas fa-photo-video",
    title: "Reemplaza el video activo",
    description: "Abre los medios de la escena seleccionada para elegir otro video o subir uno nuevo.",
    combos: Object.freeze([["mod", "Shift", "L"]])
  }),
  Object.freeze({
    id: "regenerate",
    icon: "fas fa-magic",
    title: "Regenera la escena seleccionada",
    description: "Inicia la generación desde el mismo flujo del botón del timeline. Usa la alternativa si el navegador intercepta la primera combinación.",
    combos: Object.freeze([["mod", "Shift", "G"], ["mod", "Alt", "G"]])
  }),
  Object.freeze({
    id: "export",
    icon: "fas fa-file-export",
    title: "Exporta inmediatamente en Full HD",
    description: "Abre Exportar, selecciona MP4 H.264 a 1920×1080 y confirma el job automáticamente.",
    combos: Object.freeze([["mod", "Shift", "E"]])
  }),
  Object.freeze({
    id: "music",
    icon: "fas fa-music",
    title: "Abre la biblioteca de música",
    description: "Muestra el panel de música de fondo para elegir, previsualizar y mezclar canciones.",
    combos: Object.freeze([["mod", "M"]])
  }),
  Object.freeze({
    id: "playback",
    icon: "fas fa-play-circle",
    title: "Reproduce o pausa el montaje",
    description: "Controla el preview desde la posición actual del cabezal sin buscar el botón de transporte.",
    combos: Object.freeze([["Space"]])
  }),
  Object.freeze({
    id: "navigate",
    icon: "fas fa-step-forward",
    title: "Recorre las escenas",
    description: "Avanza a la escena siguiente o vuelve a la anterior desde cualquier zona libre del editor.",
    combos: Object.freeze([["ArrowLeft"], ["ArrowRight"]])
  }),
  Object.freeze({
    id: "delete",
    icon: "fas fa-trash-alt",
    title: "Elimina audios seleccionados",
    description: "Borra del timeline los chips de audio seleccionados, sin afectar las escenas de video.",
    combos: Object.freeze([["Delete"], ["Backspace"]])
  }),
  Object.freeze({
    id: "reorder",
    icon: "fas fa-stream",
    title: "Reordena las escenas entre tracks",
    description: "Redistribuye las escenas usando la misma acción de reordenamiento disponible en las herramientas del timeline.",
    combos: Object.freeze([["mod", "Shift", "O"]])
  })
]);

export function handleSnoopyReorderTimelineTracksShortcut(event = null, {
  editorEnabled = false,
  isEditingTextField = null,
  button = null
} = {}) {
  const isShortcut = Boolean(
    event
    && (event.metaKey || event.ctrlKey)
    && event.shiftKey
    && !event.altKey
    && event.code === "KeyO"
  );
  if (!isShortcut) return false;
  if (event.defaultPrevented || !editorEnabled || !button || button.disabled) return false;
  if (typeof isEditingTextField === "function" && isEditingTextField(event.target)) return false;

  event.preventDefault();
  event.stopPropagation();
  button.click();
  return true;
}

export function resolveSnoopyShortcutModifier(platform = "") {
  const clean = String(platform || "").trim();
  return /mac|iphone|ipad|ipod/i.test(clean) ? "⌘" : "Ctrl";
}

export function resolveSnoopyShortcutKeyLabel(key = "", modifier = "Ctrl") {
  const labels = {
    mod: modifier,
    Shift: "Shift",
    Alt: "Alt",
    Space: "Espacio",
    ArrowLeft: "←",
    ArrowRight: "→",
    Delete: "Delete",
    Backspace: "Backspace"
  };
  return labels[key] || String(key || "");
}

function resolvePlatform() {
  return navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
}

function storageWasSeen() {
  try {
    return window.localStorage.getItem(SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function markStorageSeen() {
  try {
    window.localStorage.setItem(SNOOPY_SHORTCUT_GUIDE_STORAGE_KEY, "1");
  } catch (_) { }
}

export function createSnoopyShortcutGuide({
  trigger = null,
  modal = null,
  shell = null,
  loadAnime = null,
  isEditorReady = null
} = {}) {
  if (!trigger || !modal || !shell) {
    return {
      open() {}, close() {}, scheduleAutoOpen() {}, cancelPending() {}, destroy() {}
    };
  }

  const modifier = resolveSnoopyShortcutModifier(resolvePlatform());
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const state = {
    root: null,
    index: 0,
    open: false,
    manual: false,
    transitioning: false,
    pendingTimer: 0,
    autoAnimation: null,
    fallbackTimer: 0,
    fallbackStartedAt: 0,
    fallbackRemainingMs: SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS,
    pointerPaused: false,
    focusPaused: false,
    documentPaused: false,
    anime: null,
    destroyed: false
  };

  const build = () => {
    if (state.root) return state.root;
    const root = document.createElement("aside");
    root.id = "snoopyShortcutGuide";
    root.className = "snoopy-shortcut-guide";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-labelledby", "snoopyShortcutGuideTitle");
    root.innerHTML = `
      <div class="snoopy-shortcut-guide-glow" aria-hidden="true"></div>
      <div class="snoopy-shortcut-guide-head">
        <div class="snoopy-shortcut-guide-eyebrow">
          <i class="fas fa-keyboard" aria-hidden="true"></i>
          <span>Atajos de Snoopy</span>
        </div>
        <span class="snoopy-shortcut-guide-counter" aria-label="Paso actual"></span>
        <button class="snoopy-shortcut-guide-close" type="button" aria-label="Cerrar guía de atajos">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div class="snoopy-shortcut-guide-card" aria-live="polite">
        <div class="snoopy-shortcut-guide-visual" aria-hidden="true"><i></i></div>
        <div class="snoopy-shortcut-guide-copy">
          <h4 id="snoopyShortcutGuideTitle"></h4>
          <p></p>
        </div>
        <div class="snoopy-shortcut-guide-combos" aria-label="Combinación de teclas"></div>
      </div>
      <div class="snoopy-shortcut-guide-progress" aria-hidden="true"><span></span></div>
      <div class="snoopy-shortcut-guide-footer">
        <button class="snoopy-shortcut-guide-nav is-previous" type="button">
          <i class="fas fa-chevron-left" aria-hidden="true"></i><span>Anterior</span>
        </button>
        <div class="snoopy-shortcut-guide-dots" role="group" aria-label="Pasos de la guía"></div>
        <button class="snoopy-shortcut-guide-nav is-next" type="button">
          <span>Siguiente</span><i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
    modal.appendChild(root);
    state.root = root;

    root.querySelector(".snoopy-shortcut-guide-close")?.addEventListener("click", () => close({ restoreFocus: true }));
    root.querySelector(".snoopy-shortcut-guide-nav.is-previous")?.addEventListener("click", () => goTo(state.index - 1, -1));
    root.querySelector(".snoopy-shortcut-guide-nav.is-next")?.addEventListener("click", () => {
      if (state.index >= SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1) close({ restoreFocus: true });
      else goTo(state.index + 1, 1);
    });
    root.querySelector(".snoopy-shortcut-guide-dots")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-shortcut-guide-index]");
      if (!button) return;
      const nextIndex = Number(button.dataset.shortcutGuideIndex);
      goTo(nextIndex, nextIndex >= state.index ? 1 : -1);
    });
    root.addEventListener("mouseenter", () => {
      state.pointerPaused = true;
      pauseAuto();
    });
    root.addEventListener("mouseleave", () => {
      state.pointerPaused = false;
      resumeAuto();
    });
    root.addEventListener("focusin", () => {
      state.focusPaused = true;
      pauseAuto();
    });
    root.addEventListener("focusout", (event) => {
      if (root.contains(event.relatedTarget)) return;
      state.focusPaused = false;
      resumeAuto();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      goTo(state.index + (event.key === "ArrowRight" ? 1 : -1), event.key === "ArrowRight" ? 1 : -1);
    });
    return root;
  };

  const isPaused = () => state.pointerPaused || state.focusPaused || state.documentPaused;

  const stopAuto = () => {
    if (state.autoAnimation) {
      state.autoAnimation.pause?.();
      state.autoAnimation = null;
    }
    if (state.fallbackTimer) window.clearTimeout(state.fallbackTimer);
    state.fallbackTimer = 0;
    state.fallbackStartedAt = 0;
    state.fallbackRemainingMs = SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS;
  };

  const runFallbackTimer = () => {
    if (!state.open || reducedMotion || state.index >= SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1 || isPaused()) return;
    state.fallbackStartedAt = Date.now();
    state.fallbackTimer = window.setTimeout(() => goTo(state.index + 1, 1), state.fallbackRemainingMs);
  };

  const pauseAuto = () => {
    state.autoAnimation?.pause?.();
    if (state.fallbackTimer) {
      window.clearTimeout(state.fallbackTimer);
      state.fallbackTimer = 0;
      state.fallbackRemainingMs = Math.max(120, state.fallbackRemainingMs - (Date.now() - state.fallbackStartedAt));
    }
  };

  const resumeAuto = () => {
    if (!state.open || isPaused() || reducedMotion || state.index >= SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1) return;
    if (state.autoAnimation) state.autoAnimation.play?.();
    else runFallbackTimer();
  };

  const startAuto = () => {
    stopAuto();
    const root = state.root;
    const progress = root?.querySelector(".snoopy-shortcut-guide-progress span");
    if (!progress) return;
    progress.style.transform = state.index >= SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1 ? "scaleX(1)" : "scaleX(0)";
    if (reducedMotion || state.index >= SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1) return;
    if (typeof state.anime === "function") {
      state.autoAnimation = state.anime({
        targets: progress,
        scaleX: [0, 1],
        duration: SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS,
        easing: "linear",
        autoplay: !isPaused(),
        complete: () => {
          state.autoAnimation = null;
          if (state.open) goTo(state.index + 1, 1);
        }
      });
    } else {
      progress.style.transition = `transform ${SNOOPY_SHORTCUT_GUIDE_AUTO_STEP_MS}ms linear`;
      requestAnimationFrame(() => { progress.style.transform = "scaleX(1)"; });
      runFallbackTimer();
    }
  };

  const render = () => {
    const root = build();
    const item = SNOOPY_SHORTCUT_GUIDE_ITEMS[state.index];
    root.dataset.shortcutId = item.id;
    const icon = root.querySelector(".snoopy-shortcut-guide-visual i");
    if (icon) icon.className = item.icon;
    const title = root.querySelector(".snoopy-shortcut-guide-copy h4");
    const description = root.querySelector(".snoopy-shortcut-guide-copy p");
    if (title) title.textContent = item.title;
    if (description) description.textContent = item.description;
    const counter = root.querySelector(".snoopy-shortcut-guide-counter");
    if (counter) counter.textContent = `${state.index + 1} / ${SNOOPY_SHORTCUT_GUIDE_ITEMS.length}`;

    const combos = root.querySelector(".snoopy-shortcut-guide-combos");
    if (combos) {
      combos.replaceChildren(...item.combos.map((combo, comboIndex) => {
        const group = document.createElement("span");
        group.className = "snoopy-shortcut-guide-combo";
        group.setAttribute("aria-label", combo.map((key) => resolveSnoopyShortcutKeyLabel(key, modifier)).join(" + "));
        combo.forEach((key, keyIndex) => {
          if (keyIndex) {
            const plus = document.createElement("span");
            plus.className = "snoopy-shortcut-guide-plus";
            plus.textContent = "+";
            plus.setAttribute("aria-hidden", "true");
            group.appendChild(plus);
          }
          const keyNode = document.createElement("kbd");
          keyNode.textContent = resolveSnoopyShortcutKeyLabel(key, modifier);
          group.appendChild(keyNode);
        });
        if (comboIndex && item.combos.length > 1) group.dataset.alternative = "true";
        return group;
      }));
    }

    const dots = root.querySelector(".snoopy-shortcut-guide-dots");
    if (dots) {
      dots.replaceChildren(...SNOOPY_SHORTCUT_GUIDE_ITEMS.map((entry, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "snoopy-shortcut-guide-dot";
        dot.dataset.shortcutGuideIndex = String(index);
        dot.classList.toggle("is-active", index === state.index);
        dot.setAttribute("aria-label", `Mostrar ${entry.title}`);
        dot.setAttribute("aria-current", index === state.index ? "step" : "false");
        return dot;
      }));
    }
    const previous = root.querySelector(".snoopy-shortcut-guide-nav.is-previous");
    if (previous) previous.disabled = state.index === 0;
    const next = root.querySelector(".snoopy-shortcut-guide-nav.is-next span");
    if (next) next.textContent = state.index === SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1 ? "Listo" : "Siguiente";
    const nextIcon = root.querySelector(".snoopy-shortcut-guide-nav.is-next i");
    if (nextIcon) nextIcon.className = state.index === SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1 ? "fas fa-check" : "fas fa-chevron-right";
  };

  const animateCardIn = (direction = 1) => {
    const root = state.root;
    if (!root || typeof state.anime !== "function" || reducedMotion) return;
    const card = root.querySelector(".snoopy-shortcut-guide-card");
    state.anime({ targets: card, opacity: [0, 1], translateX: [direction * 24, 0], filter: ["blur(5px)", "blur(0px)"], duration: 430, easing: "easeOutExpo" });
    state.anime({ targets: root.querySelector(".snoopy-shortcut-guide-visual"), scale: [0.72, 1], rotate: [direction * 9, 0], duration: 560, easing: "easeOutBack" });
    state.anime({ targets: root.querySelectorAll(".snoopy-shortcut-guide-combo kbd"), opacity: [0, 1], translateY: [9, 0], scale: [0.84, 1], delay: state.anime.stagger(55), duration: 360, easing: "easeOutBack" });
  };

  const goTo = (nextIndex = 0, direction = 1) => {
    const bounded = Math.max(0, Math.min(SNOOPY_SHORTCUT_GUIDE_ITEMS.length - 1, Number(nextIndex) || 0));
    if (!state.open || state.transitioning || bounded === state.index) return;
    stopAuto();
    const card = state.root?.querySelector(".snoopy-shortcut-guide-card");
    const commit = () => {
      state.index = bounded;
      render();
      animateCardIn(direction);
      state.transitioning = false;
      startAuto();
    };
    if (typeof state.anime === "function" && card && !reducedMotion) {
      state.transitioning = true;
      state.anime({ targets: card, opacity: [1, 0], translateX: [0, direction * -18], filter: ["blur(0px)", "blur(4px)"], duration: 170, easing: "easeInQuad", complete: commit });
    } else {
      commit();
    }
  };

  const position = () => {
    const root = state.root;
    if (!root || root.hidden || window.innerWidth <= 768) return;
    const rect = trigger.getBoundingClientRect();
    const width = root.offsetWidth || 390;
    const height = root.offsetHeight || 330;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const top = Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 12));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.setProperty("--shortcut-guide-caret-x", `${Math.max(24, Math.min(width - 24, rect.left + rect.width / 2 - left))}px`);
  };

  const close = ({ restoreFocus = false, animate = true } = {}) => {
    window.clearTimeout(state.pendingTimer);
    state.pendingTimer = 0;
    if (!state.open || !state.root) return;
    stopAuto();
    state.open = false;
    state.transitioning = false;
    trigger.classList.remove("is-active");
    trigger.setAttribute("aria-expanded", "false");
    const finish = () => {
      if (!state.root) return;
      state.root.hidden = true;
      state.root.style.removeProperty("opacity");
      state.root.style.removeProperty("transform");
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    if (animate && typeof state.anime === "function" && !reducedMotion) {
      state.anime({ targets: state.root, opacity: [1, 0], translateY: [0, -8], scale: [1, 0.97], duration: 180, easing: "easeInQuad", complete: finish });
    } else {
      finish();
    }
  };

  const open = async ({ manual = true, markSeen = false } = {}) => {
    if (state.destroyed || isEditorReady?.() === false) return;
    const root = build();
    if (state.open) {
      if (manual) close({ restoreFocus: false });
      return;
    }
    if (markSeen) markStorageSeen();
    state.manual = manual;
    state.index = 0;
    state.open = true;
    state.transitioning = false;
    state.pointerPaused = false;
    state.focusPaused = false;
    root.hidden = false;
    trigger.classList.add("is-active");
    trigger.setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(position);
    state.anime = reducedMotion || typeof loadAnime !== "function" ? null : await loadAnime().catch(() => null);
    if (!state.open) return;
    if (typeof state.anime === "function") {
      state.anime.remove(root);
      state.anime({ targets: root, opacity: [0, 1], translateY: [-12, 0], scale: [0.92, 1], duration: 520, easing: "easeOutBack" });
      animateCardIn(1);
    }
    startAuto();
    if (manual) root.querySelector(".snoopy-shortcut-guide-close")?.focus({ preventScroll: true });
  };

  const cancelPending = () => {
    window.clearTimeout(state.pendingTimer);
    state.pendingTimer = 0;
  };

  const scheduleAutoOpen = (delayMs = 900, attemptsLeft = 10) => {
    if (state.destroyed || state.open || state.pendingTimer || storageWasSeen()) return;
    state.pendingTimer = window.setTimeout(() => {
      state.pendingTimer = 0;
      if (isEditorReady?.() === false) {
        if (attemptsLeft > 0) scheduleAutoOpen(260, attemptsLeft - 1);
        return;
      }
      open({ manual: false, markSeen: true });
    }, Math.max(0, Number(delayMs) || 0));
  };

  const handleTriggerClick = () => open({ manual: true, markSeen: false });
  const handleOutsideClick = (event) => {
    if (!state.open || state.root?.contains(event.target) || trigger.contains(event.target)) return;
    close({ restoreFocus: false });
  };
  const handleEscape = (event) => {
    if (!state.open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close({ restoreFocus: true });
  };
  const handleVisibility = () => {
    state.documentPaused = document.hidden;
    if (state.documentPaused) pauseAuto();
    else resumeAuto();
  };
  const handleViewportChange = () => {
    if (state.open) requestAnimationFrame(position);
  };

  trigger.addEventListener("click", handleTriggerClick);
  document.addEventListener("pointerdown", handleOutsideClick, true);
  document.addEventListener("keydown", handleEscape, true);
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("resize", handleViewportChange, { passive: true });
  window.addEventListener("scroll", handleViewportChange, { passive: true, capture: true });

  return {
    open,
    close,
    scheduleAutoOpen,
    cancelPending,
    destroy() {
      state.destroyed = true;
      cancelPending();
      close({ animate: false });
      trigger.removeEventListener("click", handleTriggerClick);
      document.removeEventListener("pointerdown", handleOutsideClick, true);
      document.removeEventListener("keydown", handleEscape, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      state.root?.remove();
      state.root = null;
    }
  };
}
