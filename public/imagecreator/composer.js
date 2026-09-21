export function bindComposer(elements, handlers = {}) {
  if (elements.promptInput) {
    elements.promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handlers.onSubmit?.();
      }
    });
  }
  elements.attachBtn?.addEventListener("click", () => elements.attachmentInput?.click());
  elements.attachmentInput?.addEventListener("change", (event) => handlers.onFilesSelected?.(event.target.files));
  elements.sendBtn?.addEventListener("click", () => handlers.onSubmit?.());
}

export function setComposerDisabled(elements, disabled = false) {
  if (elements.promptInput) elements.promptInput.disabled = disabled;
  if (elements.attachBtn) elements.attachBtn.disabled = disabled;
  if (elements.sendBtn) elements.sendBtn.disabled = disabled;
  if (elements.attachmentInput) elements.attachmentInput.disabled = disabled;
}

export function clearComposer(elements) {
  if (elements.promptInput) {
    elements.promptInput.value = "";
    elements.promptInput.style.removeProperty("height");
  }
  if (elements.attachmentInput) elements.attachmentInput.value = "";
}
