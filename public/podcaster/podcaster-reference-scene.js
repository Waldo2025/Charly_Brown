import podcasterMediaState from "./podcaster-media-state.js?v=2026-09-11.snoopy-voice-23";

export function applyReferenceImageAsScene(session, rowId, reference) {
  const key = String(rowId || "").trim();
  const rows = session?.script?.rows || [];
  const rowIndex = rows.findIndex((row) => String(row?.id || "").trim() === key);
  if (rowIndex < 0) throw new Error("La escena ya no está disponible.");
  const source = {
    downloadUrl: String(reference?.downloadUrl || reference?.url || "").trim(),
    storagePath: String(reference?.storagePath || reference?.path || "").trim(),
    dataUrl: String(reference?.dataUrl || "").trim(),
    localMediaCacheKey: String(reference?.localMediaCacheKey || "").trim()
  };
  if (source.storagePath || source.downloadUrl) source.dataUrl = "";
  if (!Object.values(source).some(Boolean)) throw new Error("La imagen de referencia aún no está disponible.");
  const clip = {
    rowId: key,
    type: "image",
    mediaKind: "image",
    manuallyReplaced: true,
    mimeType: String(reference?.mimeType || "image/png"),
    model: "reference-image",
    durationSec: Math.max(1, Number(rows[rowIndex]?.durationSec || 8)),
    ...source,
    updatedAt: new Date().toISOString()
  };
  const context = globalThis.window?.PodcasterSceneMedia?.capture?.(session, key, "video")
    || podcasterMediaState.captureMediaSelection(session, key, "video", globalThis.crypto?.randomUUID?.() || `${Date.now()}_${rowIndex}`);
  context.effects = null;
  const applied = podcasterMediaState.selectSceneMedia(session, key, clip, context);
  if (applied.status !== "applied") throw new Error("No se pudo aplicar la imagen de referencia a la escena.");
  return { ...applied, context };
}

export function chooseReferenceSceneImage(references, { resolvePreview = (reference) => reference.downloadUrl || reference.url || "", returnFocus = null } = {}) {
  if (!Array.isArray(references) || !references.length) return Promise.resolve(null);
  if (references.length === 1) return Promise.resolve(references[0]);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "pme-modal-overlay podcast-reference-scene-picker";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `<div class="pme-modal-container pme-scene-replacement-modal" role="dialog" aria-modal="true" aria-labelledby="podcastReferenceScenePickerTitle">
      <div class="pme-modal-header"><h3 id="podcastReferenceScenePickerTitle">Elegir imagen de referencia</h3><button class="pme-modal-close" type="button" aria-label="Cerrar selector"><i class="fas fa-times" aria-hidden="true"></i></button></div>
      <div class="pme-modal-body"><div class="scene-video-selector-grid"></div></div>
    </div>`;
    const finish = (reference) => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      (returnFocus?.isConnected ? returnFocus : previousFocus?.isConnected ? previousFocus : null)?.focus?.();
      resolve(reference);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); finish(null); }
      if (event.key === "Tab") {
        const focusable = [...overlay.querySelectorAll("button")];
        const index = focusable.indexOf(document.activeElement);
        if (event.shiftKey && index === 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
      }
    };
    const grid = overlay.querySelector(".scene-video-selector-grid");
    references.forEach((reference, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scene-video-selector-card podcast-reference-scene-card";
      button.setAttribute("aria-label", `Usar referencia ${index + 1}: ${String(reference?.name || `Imagen ${index + 1}`)}`);
      const image = document.createElement("img");
      image.alt = "";
      const label = document.createElement("span");
      label.textContent = String(reference?.name || `Imagen ${index + 1}`);
      button.append(image, label);
      button.addEventListener("click", () => finish(reference));
      grid.appendChild(button);
      Promise.resolve(resolvePreview(reference)).then((url) => {
        if (overlay.isConnected && url) image.src = String(url);
      }).catch(() => {});
    });
    overlay.querySelector(".pme-modal-close").addEventListener("click", () => finish(null));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(null); });
    const host = document.fullscreenElement
      || document.querySelector(".snoopy-editor-modal.is-snoopy-editor-fullscreen")
      || document.body;
    host.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    overlay.querySelector(".pme-modal-close")?.focus();
  });
}
