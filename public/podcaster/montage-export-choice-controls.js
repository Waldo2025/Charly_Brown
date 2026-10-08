export function syncMontageExportChoiceControls(modal) {
  if (!modal) return;
  modal.querySelectorAll("[data-export-select]").forEach((group) => {
    const select = modal.querySelector(`#${group.dataset.exportSelect}`);
    if (!select) return;
    group.querySelectorAll("[data-export-value]").forEach((button) => {
      const active = button.dataset.exportValue === select.value;
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
      button.disabled = select.disabled;
    });
  });
}

export function initializeMontageExportChoiceControls(modal) {
  if (!modal || modal.dataset.exportChoicesReady === "1") return;
  modal.dataset.exportChoicesReady = "1";
  modal.querySelectorAll("[data-export-select]").forEach((group) => {
    const select = modal.querySelector(`#${group.dataset.exportSelect}`);
    if (!select) return;
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export-value]");
      if (!button || button.disabled) return;
      select.value = button.dataset.exportValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncMontageExportChoiceControls(modal);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const buttons = Array.from(group.querySelectorAll("[data-export-value]:not(:disabled)"));
      const current = buttons.indexOf(document.activeElement);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(Math.max(0, current) + direction + buttons.length) % buttons.length];
      next?.focus();
      next?.click();
      event.preventDefault();
    });
    select.addEventListener("change", () => syncMontageExportChoiceControls(modal));
  });
  new MutationObserver(() => {
    if (!modal.hidden) syncMontageExportChoiceControls(modal);
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  syncMontageExportChoiceControls(modal);
}
