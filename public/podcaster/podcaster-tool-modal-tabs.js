const TOOLS = [
  { id: "text", label: "Texto estilizado", icon: "fa-font", root: "#stylizedTextEditorModal", title: "Texto estilizado" },
  { id: "cards", label: "Cards", icon: "fa-id-card", root: ".podcast-overlay-card-editor", title: "Cards" },
  { id: "layers", label: "Capas de escena", icon: "fa-layer-group", root: ".podcast-scene-image-layers-editor", title: "Capas de escena" },
  { id: "effects", label: "Efectos de imagen", icon: "fa-magic", root: ".podcast-image-effects-editor", title: "Efectos de imagen" }
];

let activeTool = "";
let activeRowId = "";
let shell = null;

function ensureShell() {
  if (shell?.isConnected) return shell;
  shell = document.createElement("div");
  shell.id = "snoopyUnifiedEditorModal";
  shell.className = "snoopy-unified-editor-modal";
  shell.hidden = true;
  shell.innerHTML = `
    <div class="snoopy-unified-editor-backdrop"></div>
    <section class="snoopy-unified-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="snoopyUnifiedEditorTitle">
      <header class="snoopy-unified-editor-header">
        <h2 id="snoopyUnifiedEditorTitle">Editor de escena</h2>
        <nav class="snoopy-unified-editor-tabs" role="tablist" aria-label="Herramientas de edición">
          ${TOOLS.map((tool) => `<button type="button" role="tab" id="snoopy-editor-tab-${tool.id}" aria-controls="snoopy-editor-pane-${tool.id}" aria-selected="false" data-unified-editor-tab="${tool.id}"><i class="fas ${tool.icon}" aria-hidden="true"></i><span>${tool.label}</span></button>`).join("")}
        </nav>
        <button class="snoopy-unified-editor-close" type="button" aria-label="Cerrar editor"><i class="fas fa-times" aria-hidden="true"></i></button>
      </header>
      <div class="snoopy-unified-editor-content">
        ${TOOLS.map((tool) => `<div class="snoopy-unified-editor-pane" id="snoopy-editor-pane-${tool.id}" role="tabpanel" aria-labelledby="snoopy-editor-tab-${tool.id}" data-unified-editor-pane="${tool.id}" hidden></div>`).join("")}
      </div>
    </section>`;
  document.body.append(shell);
  shell.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-unified-editor-tab]");
    if (tab) { void activateTool(tab.dataset.unifiedEditorTab); return; }
    if (event.target.closest(".snoopy-unified-editor-close, .snoopy-unified-editor-backdrop")) dismissActiveTool();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell && !shell.hidden) dismissActiveTool();
  });
  return shell;
}

function paneFor(toolId) {
  return ensureShell().querySelector(`[data-unified-editor-pane="${toolId}"]`);
}

function findToolRoot(toolId) {
  const tool = TOOLS.find((item) => item.id === toolId);
  return tool ? document.querySelector(tool.root) : null;
}

function syncUnifiedEditorTheme() {
  const source = document.querySelector("#podcastVideoShell") || document.documentElement;
  const styles = getComputedStyle(source);
  const current = ensureShell();
  for (const token of ["--snoopy-surface", "--snoopy-surface-subtle", "--snoopy-border", "--snoopy-text", "--snoopy-text-muted", "--snoopy-accent"]) {
    const value = styles.getPropertyValue(token).trim();
    if (value) current.style.setProperty(token, value);
  }
}

function setActive(toolId) {
  const current = ensureShell();
  const tool = TOOLS.find((item) => item.id === toolId);
  if (!tool) return;
  if (activeTool && activeTool !== toolId) {
    if (activeTool === "text") window.PodcasterMediaEditor?.pausePreview?.();
    if (activeTool === "layers") window.PodcasterSceneImageLayers?.pause?.();
    if (activeTool === "effects") window.PodcasterImageEffectsEditor?.pause?.();
  }
  activeTool = toolId;
  current.querySelector("#snoopyUnifiedEditorTitle").textContent = tool.title;
  current.querySelectorAll("[data-unified-editor-tab]").forEach((button) => {
    const selected = button.dataset.unifiedEditorTab === toolId;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  current.querySelectorAll("[data-unified-editor-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.unifiedEditorPane !== toolId;
  });
  current.hidden = false;
}

export function presentUnifiedToolModal(toolId, root, rowId = "") {
  const targetPane = paneFor(toolId);
  if (!targetPane || !root) return false;
  syncUnifiedEditorTheme();
  if (root.parentElement !== targetPane) targetPane.append(root);
  if (!root.dataset.unifiedCloseObserver) {
    const observer = new MutationObserver(() => {
      if (root.hidden && activeTool === toolId && shell && !shell.hidden) shell.hidden = true;
    });
    observer.observe(root, { attributes: true, attributeFilter: ["hidden"] });
    root.dataset.unifiedCloseObserver = "true";
  }
  root.hidden = false;
  if (rowId) {
    activeRowId = String(rowId);
    targetPane.dataset.rowId = activeRowId;
  }
  setActive(toolId);
  requestAnimationFrame(() => root.querySelector("input:not([type=hidden]), button, [tabindex]:not([tabindex='-1'])")?.focus?.({ preventScroll: true }));
  return true;
}

async function activateTool(toolId) {
  const targetPane = paneFor(toolId);
  const existingRoot = findToolRoot(toolId);
  if (existingRoot?.parentElement === targetPane && !existingRoot.hidden) {
    setActive(toolId);
    return;
  }
  const rowId = String(activeRowId || targetPane?.dataset.rowId || window.PodcasterState?.activeRowId || window.getActiveSession?.()?.script?.rows?.[0]?.id || "");
  if (toolId === "text" && !window.PodcasterMediaEditor?.openTextEditor) {
    try { await import("./podcaster-media-editor.js?rev=2026-10-07.unified-tools-1"); }
    catch (error) { console.error("No se pudo cargar el editor de texto estilizado.", error); return; }
  }
  if (existingRoot && existingRoot.parentElement === targetPane && existingRoot.hidden) {
    switch (toolId) {
      case "text": window.PodcasterMediaEditor?.openTextEditor?.(rowId); break;
      case "cards": window.PodcasterOverlayCardsEditor?.openNew?.(); break;
      case "layers": window.PodcasterSceneImageLayers?.open?.(rowId); break;
      case "effects": window.PodcasterImageEffectsEditor?.openImageEffectsEditor?.(rowId); break;
    }
    return;
  }
  switch (toolId) {
    case "text": window.PodcasterMediaEditor?.openTextEditor?.(rowId); break;
    case "cards": window.PodcasterOverlayCardsEditor?.openNew?.(); break;
    case "layers": window.PodcasterSceneImageLayers?.open?.(rowId); break;
    case "effects": window.PodcasterImageEffectsEditor?.openImageEffectsEditor?.(rowId); break;
  }
}

function dismissActiveTool() {
  const targetPane = paneFor(activeTool);
  const selectors = {
    text: "#closeStylizedTextEditorBtn",
    cards: 'button[data-action="overlay-card-close"]',
    layers: 'button[data-layer-action="close"]',
    effects: '[data-image-effect-action="close"]'
  };
  const closeButton = targetPane?.querySelector(selectors[activeTool]);
  if (closeButton) closeButton.click();
  if (shell) shell.hidden = true;
}
