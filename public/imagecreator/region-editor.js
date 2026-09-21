const TOOL_CONFIG = Object.freeze({
  pencil: { label: "lápiz rojo", color: "#ff3b30", alpha: 0.96, width: 8 },
  marker: { label: "plumón amarillo", color: "#ffe14d", alpha: 0.5, width: 34 }
});

export function buildLocalizedEditPrompt(instruction = "", tool = "marker") {
  const cleanInstruction = String(instruction || "").trim();
  if (!cleanInstruction) throw new Error("region_instruction_required");
  const toolLabel = TOOL_CONFIG[tool]?.label || TOOL_CONFIG.marker.label;
  return [
    "Realiza una edición localizada sobre la imagen.",
    "La Referencia 1 es la imagen original limpia y es la base que debes conservar.",
    `La Referencia 2 es únicamente un mapa visual de ubicación: el trazo de ${toolLabel} señala la zona exacta que debes modificar.`,
    `Cambio solicitado: ${cleanInstruction}`,
    "Modifica exclusivamente la región señalada. Mantén sin cambios el encuadre, la composición, los sujetos, el estilo, la iluminación, los colores y todos los píxeles visualmente ajenos a esa zona.",
    "No incluyas el trazo, el color de marcado ni ninguna anotación en la imagen final. Devuelve la imagen completa editada."
  ].join(" ");
}

const TEXT_STYLE_LABELS = Object.freeze({
  sans: "sans serif limpia",
  serif: "serif editorial",
  display: "display gruesa",
  handwritten: "manuscrita"
});

export function buildLocalizedTextEditPrompt({ currentText = "", newText = "", fontStyle = "sans", tool = "marker" } = {}) {
  const replacement = String(newText || "").trim();
  if (!replacement) throw new Error("replacement_text_required");
  const current = String(currentText || "").trim();
  const toolLabel = TOOL_CONFIG[tool]?.label || TOOL_CONFIG.marker.label;
  return [
    "Edita únicamente el texto dentro de la zona señalada de la imagen.",
    "La Referencia 1 es la imagen original limpia que debes conservar.",
    `La Referencia 2 es sólo un mapa de ubicación; el trazo de ${toolLabel} indica el texto que debe cambiar.`,
    current ? `Texto actual: \"${current}\".` : "Identifica el texto actual únicamente dentro de la zona marcada.",
    `Texto nuevo exacto: \"${replacement}\".`,
    `Usa un estilo de letra ${TEXT_STYLE_LABELS[fontStyle] || TEXT_STYLE_LABELS.sans}.`,
    "Respeta la posición, alineación, escala, perspectiva, color, iluminación y textura del diseño original.",
    "No agregues otras palabras ni cambies logotipos, fondo, personajes u objetos fuera de la zona.",
    "No incluyas el trazo de marcado. Devuelve la imagen completa editada y verifica letra por letra el texto nuevo."
  ].join(" ");
}

export function buildTextRemovalPrompt({ currentText = "", tool = "marker" } = {}) {
  const current = String(currentText || "").trim();
  const toolLabel = TOOL_CONFIG[tool]?.label || TOOL_CONFIG.marker.label;
  return [
    "Realiza una limpieza localizada de texto sobre la imagen.",
    "La Referencia 1 es la imagen original limpia y la Referencia 2 es sólo un mapa de ubicación.",
    `El trazo de ${toolLabel} marca la zona exacta.`,
    current ? `Elimina únicamente el texto \"${current}\" dentro de esa zona.` : "Elimina únicamente el texto situado dentro de esa zona.",
    "Reconstruye el fondo que quedaría detrás del texto respetando textura, luz, perspectiva y color.",
    "No escribas texto nuevo. No modifiques ningún píxel visualmente ajeno a la zona marcada. Devuelve la imagen completa sin el trazo."
  ].join(" ");
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
  };
}

export function createRegionEditor(elements = {}, handlers = {}) {
  const root = elements.regionEditor;
  const canvas = elements.regionCanvas;
  const instructionInput = elements.regionInstruction;
  const status = elements.regionStatus;
  const applyButton = elements.regionApplyBtn;
  const ctx = canvas?.getContext("2d");
  const strokes = [];
  let sourceImage = null;
  let activeStroke = null;
  let activePointerId = null;
  let activeTool = "marker";
  let editorMode = "region";
  let restoreFocusTo = null;

  function setStatus(message = "", isError = false) {
    if (!status) return;
    status.textContent = String(message || "");
    status.classList.toggle("is-error", isError);
  }

  function reflectTools() {
    elements.regionToolButtons?.forEach((button) => {
      const selected = button.dataset.regionTool === activeTool;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function reflectPromptPanel({ focus = false } = {}) {
    const hasSelection = strokes.length > 0;
    root?.classList.toggle("has-selection", hasSelection);
    elements.regionPromptPanel?.classList.toggle("hidden", !hasSelection);
    if (focus && hasSelection) {
      window.setTimeout(() => (editorMode === "text" ? elements.regionNewText : instructionInput)?.focus(), 40);
    }
  }

  function drawStroke(stroke) {
    if (!ctx || !stroke?.points?.length) return;
    const config = TOOL_CONFIG[stroke.tool] || TOOL_CONFIG.marker;
    const scale = Math.max(canvas.width, canvas.height) / 1000;
    ctx.save();
    ctx.globalAlpha = config.alpha;
    ctx.strokeStyle = config.color;
    ctx.fillStyle = config.color;
    ctx.lineWidth = Math.max(3, config.width * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x, stroke.points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    if (!ctx || !sourceImage || !canvas.width || !canvas.height) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    strokes.forEach(drawStroke);
    if (activeStroke) drawStroke(activeStroke);
  }

  function close({ restoreFocus = true } = {}) {
    root?.classList.add("hidden");
    root?.setAttribute("aria-hidden", "true");
    activeStroke = null;
    activePointerId = null;
    if (restoreFocus) restoreFocusTo?.focus?.();
  }

  async function open({ dataUrl = "", trigger = null, mode = "region" } = {}) {
    const source = String(dataUrl || "").trim();
    if (!root || !canvas || !ctx || !source) throw new Error("region_source_missing");
    restoreFocusTo = trigger || document.activeElement;
    strokes.splice(0);
    activeStroke = null;
    activeTool = "marker";
    editorMode = mode === "text" ? "text" : "region";
    instructionInput.value = "";
    if (elements.regionCurrentText) elements.regionCurrentText.value = "";
    if (elements.regionNewText) elements.regionNewText.value = "";
    root.dataset.editorMode = editorMode;
    root.classList.remove("has-selection");
    elements.regionPromptPanel?.classList.add("hidden");
    instructionInput.closest(".ic-region-instruction")?.classList.toggle("hidden", editorMode === "text");
    elements.regionTextFields?.classList.toggle("hidden", editorMode !== "text");
    const title = root.querySelector("#icRegionEditorTitle");
    if (title) title.textContent = editorMode === "text" ? "Señala el texto que quieres reemplazar" : "Señala la zona que quieres cambiar";
    setStatus(editorMode === "text" ? "Marca el texto y escribe su reemplazo exacto." : "Marca la zona que deseas cambiar.");
    reflectTools();
    sourceImage = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("region_source_decode_failed"));
      image.src = source;
    });
    const naturalWidth = Number(sourceImage.naturalWidth || sourceImage.width || 1);
    const naturalHeight = Number(sourceImage.naturalHeight || sourceImage.height || 1);
    const scale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    render();
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    window.setTimeout(() => canvas?.focus(), 40);
  }

  function getNormalizedBounds() {
    const points = strokes.flatMap((stroke) => stroke.points || []);
    if (!points.length || !canvas.width || !canvas.height) return null;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const paddingX = Math.max(canvas.width * 0.015, 12);
    const paddingY = Math.max(canvas.height * 0.015, 12);
    const x = Math.max(0, (minX - paddingX) / canvas.width);
    const y = Math.max(0, (minY - paddingY) / canvas.height);
    return {
      x,
      y,
      width: Math.min(1 - x, (maxX - minX + (paddingX * 2)) / canvas.width),
      height: Math.min(1 - y, (maxY - minY + (paddingY * 2)) / canvas.height)
    };
  }

  function onPointerDown(event) {
    if (!sourceImage || applyButton?.disabled) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    activeStroke = { tool: activeTool, points: [canvasPoint(canvas, event)] };
    render();
  }

  function onPointerMove(event) {
    if (!activeStroke || event.pointerId !== activePointerId) return;
    event.preventDefault();
    activeStroke.points.push(canvasPoint(canvas, event));
    render();
  }

  function finishStroke(event) {
    if (!activeStroke || event.pointerId !== activePointerId) return;
    const isFirstStroke = strokes.length === 0;
    if (activeStroke.points.length) strokes.push(activeStroke);
    activeStroke = null;
    activePointerId = null;
    render();
    setStatus(`${strokes.length} trazo(s). Escribe el cambio y aplícalo.`);
    reflectPromptPanel({ focus: isFirstStroke });
  }

  canvas?.addEventListener("pointerdown", onPointerDown);
  canvas?.addEventListener("pointermove", onPointerMove);
  canvas?.addEventListener("pointerup", finishStroke);
  canvas?.addEventListener("pointercancel", finishStroke);
  elements.regionToolButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      activeTool = TOOL_CONFIG[button.dataset.regionTool] ? button.dataset.regionTool : "marker";
      reflectTools();
    });
  });
  elements.regionUndoBtn?.addEventListener("click", () => {
    strokes.pop();
    render();
    reflectPromptPanel();
    setStatus(strokes.length ? `${strokes.length} trazo(s).` : "Marca la zona que deseas cambiar.");
  });
  elements.regionClearBtn?.addEventListener("click", () => {
    strokes.splice(0);
    render();
    reflectPromptPanel();
    setStatus("Marca la zona que deseas cambiar.");
  });
  elements.regionCloseButtons?.forEach((button) => button.addEventListener("click", () => close()));
  root?.addEventListener("pointerdown", (event) => {
    if (!handlers.embedded && event.target === root) close();
  });
  root?.addEventListener("keydown", (event) => {
    if (!handlers.embedded && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  applyButton?.addEventListener("click", async () => {
    const instruction = String(instructionInput?.value || "").trim();
    const newText = String(elements.regionNewText?.value || "").trim();
    if (!strokes.length) {
      setStatus("Dibuja al menos un trazo sobre la zona que deseas cambiar.", true);
      canvas?.focus();
      return;
    }
    if (editorMode !== "text" && !instruction) {
      setStatus("Describe el cambio que debe hacerse en la zona marcada.", true);
      instructionInput?.focus();
      return;
    }
    if (editorMode === "text" && !newText) {
      setStatus("Escribe el texto nuevo exactamente como debe aparecer.", true);
      elements.regionNewText?.focus();
      return;
    }
    try {
      applyButton.disabled = true;
      setStatus("Preparando edición localizada...");
      await handlers.onApply?.({
        annotatedDataUrl: canvas.toDataURL("image/jpeg", 0.92),
        instruction,
        tool: activeTool,
        editorMode,
        regionBounds: getNormalizedBounds(),
        currentText: String(elements.regionCurrentText?.value || "").trim(),
        newText,
        textRenderMode: elements.regionTextModeInputs?.find((input) => input.checked)?.value || "integrated",
        fontStyle: String(elements.regionFontStyle?.value || "sans"),
        textColor: String(elements.regionTextColor?.value || "#ffffff")
      });
    } catch (error) {
      setStatus(error?.message || "No fue posible preparar la edición localizada.", true);
    } finally {
      applyButton.disabled = false;
    }
  });

  reflectTools();
  return { open, close, render };
}
