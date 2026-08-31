/**
 * Controlador de paneles redimensionables para Marcie Blog Editor
 * Soporta Pointer Events + Mouse Events en window, doble clic para reset, y persistencia en localStorage.
 */

const STORAGE_KEYS = {
  left: "marcie_left_panel_width",
  right: "marcie_right_panel_width"
};

const DEFAULTS = {
  left: 320,
  right: 380
};

const BOUNDS = {
  left: { min: 220, max: 540 },
  right: { min: 260, max: 600 }
};

function applyPanelWidth(panel, widthPx) {
  if (!panel) return;
  const w = `${Math.round(widthPx)}px`;
  panel.style.width = w;
  panel.style.minWidth = w;
  panel.style.maxWidth = w;
  panel.style.flexBasis = w;
  panel.style.flexGrow = "0";
  panel.style.flexShrink = "0";
}

export function initPanelResizers() {
  const leftPanel = document.getElementById("left-panel");
  const leftResizer = document.getElementById("left-resizer");
  const rightPanel = document.getElementById("right-panel");
  const rightResizer = document.getElementById("right-resizer");

  // 1. Restaurar anchos guardados
  if (leftPanel) {
    const savedLeft = parseInt(localStorage.getItem(STORAGE_KEYS.left), 10);
    const initialLeft = (!Number.isNaN(savedLeft) && savedLeft >= BOUNDS.left.min && savedLeft <= BOUNDS.left.max)
      ? savedLeft
      : DEFAULTS.left;
    applyPanelWidth(leftPanel, initialLeft);
  }

  if (rightPanel) {
    const savedRight = parseInt(localStorage.getItem(STORAGE_KEYS.right), 10);
    const initialRight = (!Number.isNaN(savedRight) && savedRight >= BOUNDS.right.min && savedRight <= BOUNDS.right.max)
      ? savedRight
      : DEFAULTS.right;
    applyPanelWidth(rightPanel, initialRight);
  }

  // 2. Configurar resizer izquierdo
  if (leftPanel && leftResizer) {
    wireResizer({
      handle: leftResizer,
      panel: leftPanel,
      side: "left",
      bounds: BOUNDS.left,
      defaultValue: DEFAULTS.left,
      storageKey: STORAGE_KEYS.left
    });
  }

  // 3. Configurar resizer derecho
  if (rightPanel && rightResizer) {
    wireResizer({
      handle: rightResizer,
      panel: rightPanel,
      side: "right",
      bounds: BOUNDS.right,
      defaultValue: DEFAULTS.right,
      storageKey: STORAGE_KEYS.right
    });
  }
}

function wireResizer({ handle, panel, side, bounds, defaultValue, storageKey }) {
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  function onStart(clientX) {
    isDragging = true;
    startX = clientX;
    startWidth = panel.getBoundingClientRect().width;

    handle.classList.add("is-dragging");
    document.body.classList.add("is-resizing");

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onPointerEnd);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    try { handle.setPointerCapture?.(e.pointerId); } catch (_) {}
    onStart(e.clientX);
    e.preventDefault();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    onStart(e.clientX);
    e.preventDefault();
  }

  function updatePosition(clientX) {
    if (!isDragging) return;

    const deltaX = clientX - startX;
    let newWidth = side === "left" ? startWidth + deltaX : startWidth - deltaX;

    newWidth = Math.max(bounds.min, Math.min(bounds.max, newWidth));
    applyPanelWidth(panel, newWidth);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    updatePosition(e.clientX);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    updatePosition(e.clientX);
    e.preventDefault();
  }

  function onPointerEnd(e) {
    if (!isDragging) return;
    isDragging = false;

    handle.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing");

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onPointerEnd);

    // Guardar ancho final
    const finalWidth = Math.round(panel.getBoundingClientRect().width);
    try {
      localStorage.setItem(storageKey, String(finalWidth));
    } catch (_) {}
  }

  // Doble clic para resetear
  function onDblClick(e) {
    e.preventDefault();
    applyPanelWidth(panel, defaultValue);
    try {
      localStorage.setItem(storageKey, String(defaultValue));
    } catch (_) {}
  }

  // Accesibilidad por teclado
  function onKeyDown(e) {
    let currentWidth = panel.getBoundingClientRect().width;
    const step = e.shiftKey ? 24 : 8;

    if (side === "left") {
      if (e.key === "ArrowRight") currentWidth = Math.min(bounds.max, currentWidth + step);
      else if (e.key === "ArrowLeft") currentWidth = Math.max(bounds.min, currentWidth - step);
      else return;
    } else {
      if (e.key === "ArrowLeft") currentWidth = Math.min(bounds.max, currentWidth + step);
      else if (e.key === "ArrowRight") currentWidth = Math.max(bounds.min, currentWidth - step);
      else return;
    }

    e.preventDefault();
    applyPanelWidth(panel, currentWidth);
    try {
      localStorage.setItem(storageKey, String(Math.round(currentWidth)));
    } catch (_) {}
  }

  // Enlazar listeners
  handle.tabIndex = 0;
  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("mousedown", onMouseDown);
  handle.addEventListener("dblclick", onDblClick);
  handle.addEventListener("keydown", onKeyDown);
}
