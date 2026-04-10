function escapeHtml(value = "") {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function clampPercent(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

export function getSimplePreviewTextDefaults() {
    return {
        textPosition: { x: 6, y: 68 },
        fontFamily: "Arial, sans-serif",
        fontSize: 28,
        fontWeight: "700",
        fontStyle: "normal",
        color: "#1f2937",
        backgroundColor: "#ffffffcc"
    };
}

export function getSimplePreviewState(modal) {
    if (!modal.__simplePreviewState || typeof modal.__simplePreviewState !== "object") {
        const defaults = getSimplePreviewTextDefaults();
        modal.__simplePreviewState = {
            backgroundPreset: "none",
            backgroundOpacity: 0.18,
            backgroundPanelOpen: false,
            textPanelOpen: false,
            texts: [],
            selectedTextId: "",
            text: "",
            ...defaults
        };
    }
    return modal.__simplePreviewState;
}

export function normalizeSimplePreviewState(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const texts = Array.isArray(source.texts) ? source.texts : [];
    const defaults = getSimplePreviewTextDefaults();
    return {
        backgroundPreset: String(source.backgroundPreset || "none").trim() || "none",
        backgroundOpacity: Math.max(0.06, Math.min(0.42, Number(source.backgroundOpacity) || 0.18)),
        backgroundPanelOpen: false,
        textPanelOpen: false,
        selectedTextId: String(source.selectedTextId || "").trim(),
        text: String(source.text || "").trim(),
        textPosition: source.textPosition && typeof source.textPosition === "object" ? { ...source.textPosition } : { ...defaults.textPosition },
        fontFamily: String(source.fontFamily || defaults.fontFamily),
        fontSize: Math.max(14, Math.min(64, Number(source.fontSize) || defaults.fontSize)),
        fontWeight: String(source.fontWeight || defaults.fontWeight),
        fontStyle: String(source.fontStyle || defaults.fontStyle),
        color: String(source.color || defaults.color),
        backgroundColor: String(source.backgroundColor || defaults.backgroundColor),
        texts: texts.map((item, index) => ({
            id: String(item?.id || `preview-text-${index + 1}`),
            text: String(item?.text || "").trim(),
            textPosition: item?.textPosition && typeof item.textPosition === "object" ? { ...item.textPosition } : { ...defaults.textPosition },
            fontFamily: String(item?.fontFamily || defaults.fontFamily),
            fontSize: Math.max(14, Math.min(64, Number(item?.fontSize) || defaults.fontSize)),
            fontWeight: String(item?.fontWeight || defaults.fontWeight),
            fontStyle: String(item?.fontStyle || defaults.fontStyle),
            color: String(item?.color || defaults.color),
            backgroundColor: String(item?.backgroundColor || defaults.backgroundColor)
        })).filter((item) => item.text)
    };
}

export function applySimplePreviewStateFromLayers(modal, layers = {}) {
    const next = normalizeSimplePreviewState(layers?.simplePreview || {});
    modal.__simplePreviewState = next;
    return next;
}

export function serializeSimplePreviewState(modal) {
    const state = normalizeSimplePreviewState(getSimplePreviewState(modal));
    return {
        backgroundPreset: state.backgroundPreset,
        backgroundOpacity: state.backgroundOpacity,
        texts: state.texts,
        selectedTextId: state.selectedTextId,
        text: state.text,
        textPosition: state.textPosition,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        fontWeight: state.fontWeight,
        fontStyle: state.fontStyle,
        color: state.color,
        backgroundColor: state.backgroundColor
    };
}

export function mergeSimplePreviewIntoLayers(modal, layers = {}) {
    const next = layers && typeof layers === "object"
        ? JSON.parse(JSON.stringify(layers))
        : {};
    next.simplePreview = serializeSimplePreviewState(modal);
    return next;
}

export function loadSelectedPreviewTextIntoEditor(modal, textId = "") {
    const state = getSimplePreviewState(modal);
    const selected = state.texts.find((item) => String(item?.id || "").trim() === String(textId || "").trim()) || null;
    state.selectedTextId = selected ? selected.id : "";
    if (!selected) return;
    state.text = selected.text;
    state.textPosition = selected.textPosition && typeof selected.textPosition === "object"
        ? { ...selected.textPosition }
        : { ...getSimplePreviewTextDefaults().textPosition };
    state.fontFamily = selected.fontFamily;
    state.fontSize = selected.fontSize;
    state.fontWeight = selected.fontWeight;
    state.fontStyle = selected.fontStyle;
    state.color = selected.color;
    state.backgroundColor = selected.backgroundColor;
}

export function upsertSelectedPreviewText(modal) {
    const state = getSimplePreviewState(modal);
    const text = String(state.text || "").trim();
    if (!text) return false;
    const payload = {
        id: state.selectedTextId || `preview-text-${Date.now()}`,
        text,
        textPosition: state.textPosition && typeof state.textPosition === "object" ? { ...state.textPosition } : { ...getSimplePreviewTextDefaults().textPosition },
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        fontWeight: state.fontWeight,
        fontStyle: state.fontStyle,
        color: state.color,
        backgroundColor: state.backgroundColor
    };
    const index = state.texts.findIndex((item) => String(item?.id || "").trim() === payload.id);
    if (index >= 0) state.texts[index] = payload;
    else state.texts.push(payload);
    state.selectedTextId = payload.id;
    return true;
}

function buildSimplePreviewBackgroundPreset(preset = "none") {
    const key = String(preset || "none").trim().toLowerCase();
    if (key === "grid") {
        return `
            linear-gradient(rgba(37,99,235,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37,99,235,0.12) 1px, transparent 1px)
        `;
    }
    if (key === "reticula") {
        return `
            linear-gradient(rgba(15,23,42,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15,23,42,0.08) 1px, transparent 1px),
            linear-gradient(rgba(59,130,246,0.16) 2px, transparent 2px),
            linear-gradient(90deg, rgba(59,130,246,0.16) 2px, transparent 2px)
        `;
    }
    if (key === "dots") {
        return `radial-gradient(circle, rgba(37,99,235,0.2) 1.4px, transparent 1.6px)`;
    }
    if (key === "blobs") {
        return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'><path fill='rgba(236,72,153,0.22)' d='M112 89c95-76 246-13 250 79 2 53-54 83-91 126-43 48-68 132-141 142-85 12-159-57-184-131-25-73 3-166 77-216 25-17 58-22 89 0z'/><path fill='rgba(20,184,166,0.18)' d='M865 98c86-44 215 11 234 103 12 58-35 111-75 154-35 39-66 91-120 104-70 16-152-22-188-84-43-73-40-178 23-234 32-29 85-19 126-43z'/><path fill='rgba(250,204,21,0.18)' d='M275 512c71-42 169-37 223 14 59 55 92 153 46 225-45 71-150 95-236 78-75-14-142-66-164-136-23-73 6-165 72-181 18-4 40 4 59 0z'/><path fill='rgba(168,85,247,0.18)' d='M845 470c77-36 171-20 229 40 54 55 83 145 44 214-43 75-142 105-228 95-79-10-157-63-179-136-21-70 29-140 67-197 18-28 36-4 67-16z'/></svg>`)}")`;
    }
    return "";
}

export function buildSimplePreviewBackgroundPresentation(state = {}) {
    const presetCss = buildSimplePreviewBackgroundPreset(state?.backgroundPreset);
    if (!presetCss) return null;
    return {
        background: presetCss,
        backgroundSize:
            state?.backgroundPreset === "grid"
                ? "28px 28px, 28px 28px"
                : state?.backgroundPreset === "reticula"
                    ? "24px 24px, 24px 24px, 120px 120px, 120px 120px"
                    : state?.backgroundPreset === "dots"
                        ? "18px 18px"
                        : state?.backgroundPreset === "blobs"
                            ? "cover"
                            : "",
        opacity: String(Math.max(0.06, Math.min(0.42, Number(state?.backgroundOpacity) || 0.18))),
        mixBlendMode: state?.backgroundPreset === "blobs" ? "multiply" : "normal"
    };
}

export function buildSimplePreviewTextBoxStyle(item = {}, options = {}) {
    const defaults = getSimplePreviewTextDefaults();
    const backgroundColor = String(item?.backgroundColor || defaults.backgroundColor).trim();
    const color = String(item?.color || defaults.color).trim();
    const scale = Math.max(0.2, Number(options?.scale) || 1);
    return [
        `left:${clampPercent(item?.textPosition?.x, 2, 78)}%`,
        `top:${clampPercent(item?.textPosition?.y, 4, 88)}%`,
        `font-family:${escapeHtml(String(item?.fontFamily || defaults.fontFamily))}`,
        `font-size:${Math.max(14, Math.min(64, Number(item?.fontSize) || defaults.fontSize))}px`,
        `font-weight:${escapeHtml(String(item?.fontWeight || defaults.fontWeight))}`,
        `font-style:${escapeHtml(String(item?.fontStyle || defaults.fontStyle))}`,
        `color:${escapeHtml(color || defaults.color)}`,
        `background:${backgroundColor.toLowerCase() === "transparent" ? "transparent" : escapeHtml(backgroundColor)}`,
        `transform-origin:top left`,
        `transform:translateZ(0) scale(${scale})`
    ].join(";");
}

function getRenderableSimplePreviewTexts(state = {}) {
    const texts = Array.isArray(state?.texts)
        ? state.texts.map((item) => ({ ...item }))
        : [];
    const selectedTextId = String(state?.selectedTextId || "").trim();
    const draftText = String(state?.text || "");
    if (!selectedTextId) return texts.filter((item) => String(item?.text || "").trim());
    const draft = {
        id: selectedTextId,
        text: draftText,
        textPosition: state?.textPosition && typeof state.textPosition === "object"
            ? { ...state.textPosition }
            : { ...getSimplePreviewTextDefaults().textPosition },
        fontFamily: state?.fontFamily,
        fontSize: state?.fontSize,
        fontWeight: state?.fontWeight,
        fontStyle: state?.fontStyle,
        color: state?.color,
        backgroundColor: state?.backgroundColor
    };
    const index = texts.findIndex((item) => String(item?.id || "").trim() === selectedTextId);
    if (index >= 0) {
        texts[index] = {
            ...texts[index],
            ...draft
        };
    } else if (draftText.trim()) {
        texts.push(draft);
    }
    return texts.filter((item) => String(item?.text || "").trim());
}

export function renderSimplePreviewBackground(modal) {
    const layer = modal?.querySelector(".cb-module-graphic-lightbox__simple-preview-background-layer");
    if (!layer) return;
    const state = getSimplePreviewState(modal);
    const presentation = buildSimplePreviewBackgroundPresentation(state);
    const active = !!presentation;
    modal.classList.toggle("has-preview-background", active);
    if (!active) {
        layer.style.background = "transparent";
        layer.style.backgroundSize = "";
        layer.style.opacity = "";
        layer.style.mixBlendMode = "";
        layer.style.setProperty("display", "none", "important");
        return;
    }
    layer.style.background = presentation.background;
    layer.style.backgroundSize = presentation.backgroundSize;
    layer.style.opacity = presentation.opacity;
    layer.style.mixBlendMode = presentation.mixBlendMode;
    layer.style.setProperty("display", "block", "important");
}

export function renderSimplePreviewText(modal) {
    const target = modal?.querySelector(".cb-module-graphic-lightbox__simple-preview-text-layer");
    if (!target) return;
    const state = getSimplePreviewState(modal);
    const texts = getRenderableSimplePreviewTexts(state);
    const active = texts.length > 0;
    modal.classList.toggle("has-preview-text", active);
    target.style.setProperty("display", active ? "block" : "none", "important");
    if (!active) {
        target.innerHTML = "";
        return;
    }
    target.innerHTML = texts.map((item) => `
        <div class="cb-module-graphic-lightbox__preview-text-box cb-module-graphic-lightbox__draggable ${String(item.id || "") === String(state.selectedTextId || "") ? "is-selected" : ""}"
             data-drag-kind="preview-text"
             data-text-id="${escapeHtml(String(item.id || ""))}"
             style="${buildSimplePreviewTextBoxStyle(item)}">
            ${escapeHtml(String(item.text || ""))}
        </div>
    `).join("");
}

export function renderSimplePreviewFooter(modal) {
    const footer = modal?.querySelector(".cb-module-graphic-lightbox__footer");
    if (!footer) return;
    const state = getSimplePreviewState(modal);
    const hasPreviewText = Array.isArray(state.texts) && state.texts.length > 0;
    footer.innerHTML = `
        <div class="cb-module-graphic-lightbox__toolbar">
            <div class="cb-module-graphic-lightbox__toolbar-group">
                <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${state.backgroundPanelOpen ? "is-active" : ""}" data-layer-command="preview-bg-panel" title="Background">
                    <i class="fas fa-border-all"></i>
                </button>
                <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${state.textPanelOpen ? "is-active" : ""}" data-layer-command="preview-text-panel" title="Texto">
                    <i class="fas fa-font"></i>
                </button>
                <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${hasPreviewText ? "is-active" : ""}" data-layer-command="preview-text-toggle" title="Mostrar texto">
                    <i class="fas fa-square-pen"></i>
                </button>
            </div>
            <div class="cb-module-graphic-lightbox__toolbar-panels">
                <div class="cb-module-graphic-lightbox__toolbar-panel ${state.backgroundPanelOpen ? "is-open" : ""}">
                    <div class="cb-module-graphic-lightbox__preset-row">
                        <button type="button" class="cb-module-graphic-lightbox__icon-preset ${state.backgroundPreset === "none" ? "is-active" : ""}" data-layer-command="preview-bg-preset" data-preview-preset="none" title="Sin fondo"><i class="fas fa-ban"></i></button>
                        <button type="button" class="cb-module-graphic-lightbox__icon-preset ${state.backgroundPreset === "grid" ? "is-active" : ""}" data-layer-command="preview-bg-preset" data-preview-preset="grid" title="Cuadrícula"><i class="fas fa-table-cells-large"></i></button>
                        <button type="button" class="cb-module-graphic-lightbox__icon-preset ${state.backgroundPreset === "reticula" ? "is-active" : ""}" data-layer-command="preview-bg-preset" data-preview-preset="reticula" title="Retícula"><i class="fas fa-grip"></i></button>
                        <button type="button" class="cb-module-graphic-lightbox__icon-preset ${state.backgroundPreset === "dots" ? "is-active" : ""}" data-layer-command="preview-bg-preset" data-preview-preset="dots" title="Puntos"><i class="fas fa-braille"></i></button>
                        <button type="button" class="cb-module-graphic-lightbox__icon-preset ${state.backgroundPreset === "blobs" ? "is-active" : ""}" data-layer-command="preview-bg-preset" data-preview-preset="blobs" title="Blobs"><i class="fas fa-water"></i></button>
                    </div>
                    <label class="cb-module-graphic-lightbox__footer-range">
                        <i class="fas fa-circle-half-stroke"></i>
                        <input type="range" min="6" max="42" step="1" value="${Math.round((Number(state.backgroundOpacity) || 0.18) * 100)}" data-preview-input="backgroundOpacity">
                    </label>
                </div>
                <div class="cb-module-graphic-lightbox__toolbar-panel ${state.textPanelOpen ? "is-open" : ""}">
                    <div class="cb-module-graphic-lightbox__text-controls">
                        <button type="button" class="cb-module-graphic-lightbox__toolbar-btn" data-layer-command="preview-text-new" title="Nuevo texto">
                            <i class="fas fa-plus"></i>
                        </button>
                        <input type="text" class="cb-module-graphic-lightbox__footer-input" placeholder="Añadir texto" value="${escapeHtml(String(state.text || ""))}" data-preview-input="text">
                        <select class="cb-module-graphic-lightbox__footer-select" data-preview-input="fontFamily">
                            <option value="Arial, sans-serif"${state.fontFamily === "Arial, sans-serif" ? " selected" : ""}>Sans</option>
                            <option value="'Trebuchet MS', sans-serif"${state.fontFamily === "'Trebuchet MS', sans-serif" ? " selected" : ""}>Trebuchet</option>
                            <option value="'Georgia', serif"${state.fontFamily === "'Georgia', serif" ? " selected" : ""}>Georgia</option>
                            <option value="'Courier New', monospace"${state.fontFamily === "'Courier New', monospace" ? " selected" : ""}>Mono</option>
                        </select>
                        <input type="number" min="14" max="64" class="cb-module-graphic-lightbox__footer-number" value="${Math.max(14, Math.min(64, Number(state.fontSize) || 28))}" data-preview-input="fontSize">
                        <select class="cb-module-graphic-lightbox__footer-select" data-preview-input="fontWeight">
                            <option value="500"${state.fontWeight === "500" ? " selected" : ""}>500</option>
                            <option value="700"${state.fontWeight === "700" ? " selected" : ""}>700</option>
                            <option value="800"${state.fontWeight === "800" ? " selected" : ""}>800</option>
                        </select>
                        <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${state.fontStyle === "italic" ? "is-active" : ""}" data-layer-command="preview-text-italic" title="Italic">
                            <i class="fas fa-italic"></i>
                        </button>
                        <label class="cb-module-graphic-lightbox__color-chip">
                            <i class="fas fa-a"></i>
                            <input type="color" value="${escapeHtml(String(state.color || "#1f2937"))}" data-preview-input="color">
                        </label>
                        <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${String(state.color || "").toLowerCase() === "transparent" ? "is-active" : ""}" data-layer-command="preview-text-color-none" title="Sin color letra">
                            <i class="fas fa-eye-slash"></i>
                        </button>
                        <label class="cb-module-graphic-lightbox__color-chip">
                            <i class="fas fa-square"></i>
                            <input type="color" value="${escapeHtml((String(state.backgroundColor || "#ffffffcc").toLowerCase() === "transparent" ? "#ffffff" : String(state.backgroundColor || "#ffffffcc")).slice(0, 7))}" data-preview-input="backgroundColor">
                        </label>
                        <button type="button" class="cb-module-graphic-lightbox__toolbar-btn ${String(state.backgroundColor || "").toLowerCase() === "transparent" ? "is-active" : ""}" data-layer-command="preview-text-bg-none" title="Sin fondo">
                            <i class="fas fa-square-xmark"></i>
                        </button>
                        <button type="button" class="cb-module-graphic-lightbox__apply-btn" data-layer-command="preview-text-apply">
                            Aplicar
                        </button>
                    </div>
                </div>
            </div>
            <button type="button" class="cb-module-graphic-lightbox__apply-btn is-secondary cb-module-graphic-lightbox__footer-save" data-layer-command="preview-save">
                Guardar
            </button>
        </div>
    `;
}

export function cleanupModuleGraphicInlinePreview(figure) {
    if (!figure) return;
    figure.classList.remove("has-preview-background", "has-preview-text");
    figure.querySelectorAll(".cb-module-generated-graphic__preview-background, .cb-module-generated-graphic__preview-text-layer, .cb-module-graphic-lightbox__simple-preview-background-layer, .cb-module-graphic-lightbox__simple-preview-text-layer").forEach((node) => node.remove());
}

export function renderModuleGraphicInlinePreview(figure, layers = null) {
    if (!(figure instanceof HTMLElement)) return;
    cleanupModuleGraphicInlinePreview(figure);
    const image = figure.querySelector(".cb-module-generated-graphic__image");
    if (!(image instanceof HTMLElement)) return;
    const resolvedLayers = layers && typeof layers === "object"
        ? layers
        : (() => {
            const raw = String(image.dataset?.mcImageLayers || "").trim();
            if (!raw) return null;
            try {
                return JSON.parse(decodeURIComponent(raw));
            } catch (_) {
                return null;
            }
        })();
    const state = normalizeSimplePreviewState(resolvedLayers?.simplePreview || {});
    const backgroundPresentation = buildSimplePreviewBackgroundPresentation(state);
    const texts = Array.isArray(state.texts) ? state.texts : [];
    const baseWidth = Math.max(1, Number(image.naturalWidth) || 1024);
    const renderWidth = Math.max(1, image.getBoundingClientRect().width || image.clientWidth || figure.getBoundingClientRect().width || figure.clientWidth || baseWidth);
    const previewScale = Math.max(0.2, Math.min(1.25, renderWidth / baseWidth));

    if (backgroundPresentation) {
        const backgroundNode = document.createElement("div");
        backgroundNode.className = "cb-module-generated-graphic__preview-background cb-module-graphic-lightbox__simple-preview-background-layer";
        backgroundNode.style.background = backgroundPresentation.background;
        backgroundNode.style.backgroundSize = backgroundPresentation.backgroundSize;
        backgroundNode.style.opacity = backgroundPresentation.opacity;
        backgroundNode.style.mixBlendMode = backgroundPresentation.mixBlendMode;
        figure.insertBefore(backgroundNode, image);
        figure.classList.add("has-preview-background");
    }

    if (texts.length) {
        const textLayer = document.createElement("div");
        textLayer.className = "cb-module-generated-graphic__preview-text-layer cb-module-graphic-lightbox__simple-preview-text-layer";
        textLayer.innerHTML = texts.map((item) => `
            <div class="cb-module-generated-graphic__preview-text-box cb-module-graphic-lightbox__preview-text-box"
                 data-text-id="${escapeHtml(String(item.id || ""))}"
                 style="${buildSimplePreviewTextBoxStyle(item, { scale: previewScale })}">
                ${escapeHtml(String(item.text || ""))}
            </div>
        `).join("");
        figure.appendChild(textLayer);
        figure.classList.add("has-preview-text");
    }
}
