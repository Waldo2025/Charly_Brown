function setButtonExpandedState(buttonEl, isActive) {
  if (!buttonEl) return;
  buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  buttonEl.setAttribute("aria-label", isActive ? "Salir de pantalla completa" : "Pantalla completa");
  buttonEl.setAttribute("title", isActive ? "Salir de pantalla completa" : "Pantalla completa");
  const icon = buttonEl.querySelector("i");
  if (icon) {
    icon.classList.toggle("fa-expand", !isActive);
    icon.classList.toggle("fa-compress", isActive);
  }
}

export function createPodcasterStageFullscreenController(options = {}) {
  const targetEl = options?.targetEl || null;
  const controlsEl = options?.controlsEl || null;
  const buttonEl = options?.buttonEl || null;
  const activeClass = String(options?.activeClass || "is-stage-fullscreen").trim() || "is-stage-fullscreen";
  const fallbackClass = String(options?.fallbackClass || "is-stage-expanded").trim() || "is-stage-expanded";

  if (!targetEl || !buttonEl) {
    return {
      toggle: async () => false,
      isActive: () => false,
      destroy: () => {}
    };
  }

  let placeholderNode = null;
  let originalParent = controlsEl?.parentNode || null;
  let originalNextSibling = controlsEl?.nextSibling || null;
  let usingFallback = false;

  let controlsHost = targetEl.querySelector(".podcast-stage-fullscreen-controls-host");
  if (!controlsHost) {
    controlsHost = document.createElement("div");
    controlsHost.className = "podcast-stage-fullscreen-controls-host";
    targetEl.appendChild(controlsHost);
  }

  const isNativeFullscreenActive = () => document.fullscreenElement === targetEl;
  const isActive = () => isNativeFullscreenActive() || targetEl.classList.contains(fallbackClass);

  function mountControls() {
    if (!controlsEl || controlsEl.parentNode === controlsHost) return;
    if (!placeholderNode && controlsEl.parentNode) {
      placeholderNode = document.createComment("podcast-stage-controls-placeholder");
      controlsEl.parentNode.insertBefore(placeholderNode, controlsEl);
    }
    controlsEl.classList.add("is-attached-to-stage-fullscreen");
    controlsHost.appendChild(controlsEl);
  }

  function restoreControls() {
    if (!controlsEl || controlsEl.parentNode !== controlsHost) return;
    controlsEl.classList.remove("is-attached-to-stage-fullscreen");
    if (placeholderNode?.parentNode) {
      placeholderNode.parentNode.insertBefore(controlsEl, placeholderNode);
      placeholderNode.parentNode.removeChild(placeholderNode);
      placeholderNode = null;
      return;
    }
    if (originalParent) {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(controlsEl, originalNextSibling);
      } else {
        originalParent.appendChild(controlsEl);
      }
    }
  }

  function syncState() {
    const active = isActive();
    targetEl.classList.toggle(activeClass, active);
    setButtonExpandedState(buttonEl, active);
    if (active) mountControls();
    else restoreControls();
  }

  async function enter() {
    if (isActive()) return true;
    if (document.fullscreenEnabled && typeof targetEl.requestFullscreen === "function") {
      usingFallback = false;
      await targetEl.requestFullscreen();
      syncState();
      return true;
    }
    usingFallback = true;
    targetEl.classList.add(fallbackClass);
    syncState();
    return true;
  }

  async function exit() {
    if (isNativeFullscreenActive()) {
      await document.exitFullscreen?.();
      syncState();
      return true;
    }
    if (targetEl.classList.contains(fallbackClass)) {
      targetEl.classList.remove(fallbackClass);
      usingFallback = false;
      syncState();
      return true;
    }
    return false;
  }

  async function toggle() {
    if (isActive()) return exit();
    return enter();
  }

  function onFullscreenChange() {
    if (!isNativeFullscreenActive() && usingFallback !== true) {
      targetEl.classList.remove(fallbackClass);
    }
    syncState();
  }

  buttonEl.addEventListener("click", () => {
    toggle().catch(() => {
      targetEl.classList.toggle(fallbackClass);
      usingFallback = targetEl.classList.contains(fallbackClass);
      syncState();
    });
  });
  document.addEventListener("fullscreenchange", onFullscreenChange);
  syncState();

  return {
    toggle,
    isActive,
    destroy() {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      restoreControls();
      targetEl.classList.remove(activeClass, fallbackClass);
      setButtonExpandedState(buttonEl, false);
    }
  };
}
