export function construirActividadOriginalHtmlModulo(modulo = {}, helpers = {}) {
    const {
        hidratarHtmlInstruccionesGemini,
        sanitizarHtmlEditorial,
        escapeHtml,
        instruccionesImagenes = []
    } = helpers;

    const instruccionesRaw = String(modulo?.instrucciones || "").trim();
    if (!instruccionesRaw) return "";

    const hydrated = typeof hidratarHtmlInstruccionesGemini === "function"
        ? hidratarHtmlInstruccionesGemini(instruccionesRaw, String(modulo?.id || "").trim(), instruccionesImagenes)
        : instruccionesRaw;

    const limpiarEstilosInlineActividadOriginal = (html = "") => {
        const root = document.createElement("div");
        root.innerHTML = String(html || "");
        root.querySelectorAll("*").forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            node.style.removeProperty("background");
            node.style.removeProperty("background-color");
            node.style.removeProperty("text-decoration");
            if (!node.getAttribute("style")?.trim()) {
                node.removeAttribute("style");
            }
        });
        return root.innerHTML.trim();
    };

    const bodyHtml = instruccionesRaw.includes("<") && instruccionesRaw.includes(">")
        ? limpiarEstilosInlineActividadOriginal(sanitizarHtmlEditorial(hydrated))
        : `<p>${escapeHtml(hydrated).replace(/\n/g, "<br>")}</p>`;

    return `
        <div class="cb-original-activity-block" data-cb-original-activity-block="1" data-cb-original-render-block="1">
            <h4>Actividad original</h4>
            <div>${bodyHtml}</div>
        </div>
    `.trim();
}

export function contenidoModuloYaIncluyeActividadOriginal(html = "", helpers = {}) {
    const esEncabezadoOriginalWord = typeof helpers.esEncabezadoOriginalWord === "function"
        ? helpers.esEncabezadoOriginalWord
        : (value = "") => {
            const text = String(value || "").trim();
            return /^actividad(?:\s+\d+)?\s+original\b/i.test(text)
                || /^instrucci[oó]n(?:\s+\d+)?\s+original\b/i.test(text);
        };
    const raw = String(html || "").trim();
    if (!raw) return false;

    const root = document.createElement("div");
    root.innerHTML = raw;
    if (root.querySelector('.cb-module-block-title.is-original, [data-cb-original-activity-block="1"]')) return true;

    return Array.from(root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote"))
        .some((node) => esEncabezadoOriginalWord(node.textContent || ""));
}

export function quitarActividadOriginalDelContenido(html = "", helpers = {}) {
    const esEncabezadoOriginalWord = typeof helpers.esEncabezadoOriginalWord === "function"
        ? helpers.esEncabezadoOriginalWord
        : (value = "") => {
            const text = String(value || "").trim();
            return /^actividad(?:\s+\d+)?\s+original\b/i.test(text)
                || /^instrucci[oó]n(?:\s+\d+)?\s+original\b/i.test(text);
        };
    const raw = String(html || "").trim();
    if (!raw) return "";

    const esEncabezadoOriginal = (text = "") => {
        const limpio = String(text || "").trim();
        if (!limpio) return false;
        return esEncabezadoOriginalWord(limpio)
            || /^actividad original$/i.test(limpio)
            || /^instrucci[oó]n original$/i.test(limpio)
            || /^actividad\s+\d+\s+original\b/i.test(limpio);
    };

    const root = document.createElement("div");
    root.innerHTML = raw;
    root.querySelectorAll('[data-cb-original-activity-block="1"]').forEach((node) => node.remove());

    // Elimina wrappers legacy guardados sin el data attribute moderno.
    Array.from(root.querySelectorAll("div, section, article")).forEach((container) => {
        if (!(container instanceof HTMLElement)) return;
        const firstBlockChild = Array.from(container.children).find((child) => {
            const tag = child?.tagName?.toUpperCase?.() || "";
            return ["H1", "H2", "H3", "H4", "P", "BLOCKQUOTE"].includes(tag);
        });
        if (!firstBlockChild) return;

        const firstText = String(firstBlockChild.textContent || "").trim();
        const hasOriginalHeading =
            firstBlockChild.classList?.contains("is-original") ||
            esEncabezadoOriginal(firstText);
        if (!hasOriginalHeading) return;

        const hasProposalMarker = Array.from(container.querySelectorAll("h1, h2, h3, h4, p, li, blockquote"))
            .some((node) => /^propuesta(?:\s+actividad(?:\s+\d+)?)?\b/i.test(String(node.textContent || "").trim()));
        if (hasProposalMarker) return;

        container.remove();
    });

    const headings = Array.from(root.querySelectorAll(".cb-module-block-title.is-original, h1, h2, h3, h4, p, li, blockquote"));
    headings.forEach((heading) => {
        const text = String(heading.textContent || "").trim();
        const esBloqueOriginal =
            heading.classList?.contains("is-original") ||
            esEncabezadoOriginal(text);
        if (!esBloqueOriginal) return;

        let cursor = heading.nextElementSibling;
        const nodesToRemove = [heading];
        while (cursor) {
            const next = cursor.nextElementSibling;
            const textCursor = String(cursor.textContent || "").trim();
            const esSiguienteSeparador =
                cursor.classList?.contains("cb-module-block-title") ||
                esEncabezadoOriginalWord(textCursor) ||
                /^propuesta(?:\s+actividad(?:\s+\d+)?)?\b/i.test(textCursor);
            if (esSiguienteSeparador) break;
            nodesToRemove.push(cursor);
            cursor = next;
        }
        nodesToRemove.forEach((node) => node.remove());
    });

    return root.innerHTML.trim();
}

export function aplicarVisibilidadActividadOriginalEnContenido(html = "", modulo = {}, helpers = {}) {
    const {
        visible = false,
        renderizarContenidoModulo,
        normalizarContenidoModuloPersistible,
        construirActividadOriginalHtmlModulo: construirBloque,
        quitarActividadOriginalDelContenido: quitarBloque
    } = helpers;

    const contenidoBase = String(html || "").trim();
    const root = document.createElement("div");
    const contenidoRenderizado = typeof renderizarContenidoModulo === "function"
        ? renderizarContenidoModulo(contenidoBase, modulo?.tipo || "")
        : contenidoBase;

    root.innerHTML = contenidoRenderizado && !/Sin contenido generado/i.test(contenidoRenderizado)
        ? contenidoRenderizado
        : "";

    root.innerHTML = quitarBloque(root.innerHTML, helpers);
    if (visible) {
        const bloqueActividadOriginal = construirBloque(modulo, helpers);
        if (bloqueActividadOriginal) {
            const anchor = root.querySelector(".cb-module-block-title.is-proposal, .cb-module-question-heading, .cb-module-generated-graphic, .cb-module-question-block");
            if (anchor) {
                anchor.insertAdjacentHTML("beforebegin", bloqueActividadOriginal);
            } else if (root.innerHTML.trim()) {
                root.insertAdjacentHTML("afterbegin", bloqueActividadOriginal);
            } else {
                root.innerHTML = bloqueActividadOriginal;
            }
        }
    }

    return normalizarContenidoModuloPersistible(root.innerHTML);
}

export function prepararRenderActividadOriginal({ modulo = {}, contenidoModuloHtml = "", helpers = {} }) {
    const mostrarActividadOriginal = modulo.mostrarActividadOriginal !== false;
    const contenidoFinal = helpers.quitarActividadOriginalDelContenido(
        String(contenidoModuloHtml || "").trim(),
        helpers
    );
    const bloqueActividadOriginal = mostrarActividadOriginal
        ? helpers.construirActividadOriginalHtmlModulo(modulo, helpers)
        : "";

    return {
        mostrarActividadOriginal,
        contenidoModuloHtml: contenidoFinal,
        renderBloqueOriginal: bloqueActividadOriginal || ""
    };
}

export function actualizarEstadoActividadOriginal(card, visible) {
    if (!card) return;

    card.classList.toggle("modulo-original-oculta", !visible);

    const botonesActividad = card.querySelectorAll('[data-mc-action="agregar-actividad-original-modulo"]');
    botonesActividad.forEach((btn) => {
        btn.title = visible ? "Ocultar actividad original" : "Mostrar actividad original";
        btn.setAttribute("aria-label", visible ? "Ocultar actividad original" : "Mostrar actividad original");

        const icon = btn.querySelector("i");
        if (icon) {
            icon.classList.toggle("fa-eye", visible);
            icon.classList.toggle("fa-eye-slash", !visible);
        }

        const textSpan = btn.querySelector("span");
        if (textSpan) {
            textSpan.textContent = visible ? "Ocultar actividad original" : "Mostrar actividad original";
        }
    });

    const originalBlocks = card.querySelectorAll(
        '[data-cb-original-activity-block="1"], .cb-module-block-title.is-original, .cb-module-original-body'
    );
    originalBlocks.forEach((block) => {
        block.hidden = !visible;
        block.style.setProperty("display", visible ? "" : "none", "important");
    });
}

const modulosActividadOriginalEnToggle = new Set();

function eliminarActividadOriginalDelDom(card) {
    if (!card) return;

    card.querySelectorAll('[data-cb-original-activity-block="1"]').forEach((node) => node.remove());

    const orphanHeadings = Array.from(card.querySelectorAll(".cb-module-block-title.is-original"));
    orphanHeadings.forEach((heading) => {
        let cursor = heading.nextElementSibling;
        const nodesToRemove = [heading];
        while (cursor) {
            const next = cursor.nextElementSibling;
            if (
                cursor.classList?.contains("cb-module-block-title") ||
                cursor.classList?.contains("cb-module-question-heading") ||
                cursor.classList?.contains("cb-module-question-block")
            ) {
                break;
            }
            if (cursor.classList?.contains("cb-module-original-body")) {
                nodesToRemove.push(cursor);
                cursor = next;
                continue;
            }
            break;
        }
        nodesToRemove.forEach((node) => node.remove());
    });
}

function sincronizarBloqueActividadOriginalDerivado(card, modulo = {}, visible = false, helpers = {}) {
    if (!card) return;

    const contenidoDiv = card.querySelector('[id^="contenido-"]');
    const section = contenidoDiv?.parentElement || null;
    if (!section || !contenidoDiv) return;

    section.querySelectorAll('[data-cb-original-render-block="1"]').forEach((node) => node.remove());
    if (!visible) return;

    const bloque = helpers.construirActividadOriginalHtmlModulo?.(modulo, helpers);
    if (!bloque) return;

    const temp = document.createElement("div");
    temp.innerHTML = bloque.trim();
    const node = temp.firstElementChild;
    if (!node) return;
    node.setAttribute("data-cb-original-render-block", "1");
    section.insertBefore(node, contenidoDiv);
}

export async function sincronizarSnapshotActividadOriginal({
    moduloId,
    data,
    renderizarContenidoModulo,
    normalizarContenidoModuloPersistible,
    sanitizeRichText,
    helpers = {}
}) {
    const contenidoDiv = document.getElementById(`contenido-${moduloId}`);
    if (!contenidoDiv) return false;

    const card = document.getElementById(`modulo-${moduloId}`);
    const mostrarActividadOriginal = data.mostrarActividadOriginal !== false;
    const contenidoNormalizado = helpers.quitarActividadOriginalDelContenido(
        String(data.contenido || "").trim(),
        helpers
    );
    const contenidoRenderizado = renderizarContenidoModulo(
        contenidoNormalizado,
        data.tipo || ""
    );

    actualizarEstadoActividadOriginal(card, mostrarActividadOriginal);
    sincronizarBloqueActividadOriginalDerivado(card, data, mostrarActividadOriginal, helpers);
    if (contenidoDiv.innerHTML === contenidoRenderizado) return false;

    contenidoDiv.innerHTML = contenidoRenderizado;
    contenidoDiv.dataset.lastSavedHtml = normalizarContenidoModuloPersistible(
        sanitizeRichText(contenidoDiv.innerHTML)
    );
    return true;
}

export async function toggleOriginalActivityVisibility({
    moduloId,
    cursoIdModulo,
    obtenerModulo,
    sincronizarModuloLocal,
    renderizarContenidoModulo,
    normalizarContenidoModuloPersistible,
    sanitizeRichText,
    guardarModulo,
    modulosCache,
    construirDocIdModulo,
    subtemaActivo,
    mostrarNotificacion,
    helpers = {}
}) {
    const moduloIdSafe = String(moduloId || "").trim();
    if (!moduloIdSafe) return;
    if (modulosActividadOriginalEnToggle.has(moduloIdSafe)) return;
    modulosActividadOriginalEnToggle.add(moduloIdSafe);

    const botonesActividad = Array.from(document.querySelectorAll('[data-mc-action="agregar-actividad-original-modulo"]'))
        .filter((button) => String(button?.dataset?.mcModuloId || "").trim() === moduloIdSafe);
    botonesActividad.forEach((button) => {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.style.opacity = "0.55";
        button.style.pointerEvents = "none";
    });

    try {
    const modulo = await obtenerModulo(moduloId, cursoIdModulo);
    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    const mostrarActual = modulo.mostrarActividadOriginal !== false;
    const nuevaVisibilidad = !mostrarActual;
    const mostrarNotasMaestroInline = modulo.mostrarNotasMaestroInline !== false;
    if (typeof window !== "undefined") {
        window.__suppressModuloUpdatedToast = window.__suppressModuloUpdatedToast || {};
        window.__suppressModuloUpdatedToast[String(moduloId || "").trim()] = Date.now() + 4000;
    }
    const contenidoNormalizado = helpers.quitarActividadOriginalDelContenido(
        String(modulo?.contenido || "").trim(),
        helpers
    );
    const payloadLocal = {
        mostrarActividadOriginal: nuevaVisibilidad
    };

    sincronizarModuloLocal(moduloId, cursoIdModulo, payloadLocal);

    const card = document.getElementById(`modulo-${moduloId}`);
    if (card) {
        actualizarEstadoActividadOriginal(card, nuevaVisibilidad);
        sincronizarBloqueActividadOriginalDerivado(card, modulo, nuevaVisibilidad, helpers);
        if (typeof window?.actualizarVisibilidadNotasMaestroEnCard === "function") {
            window.actualizarVisibilidadNotasMaestroEnCard(card, mostrarNotasMaestroInline);
        }
    }

    const contenidoDiv = document.getElementById(`contenido-${moduloId}`);
    if (contenidoDiv) {
        contenidoDiv.innerHTML = renderizarContenidoModulo(
            contenidoNormalizado,
            modulo?.tipo || ""
        );
        if (typeof window?.sincronizarBloqueNotasMaestroDerivado === "function") {
            window.sincronizarBloqueNotasMaestroDerivado(moduloId, {
                ...modulo,
                mostrarNotasMaestroInline
            });
        }
        contenidoDiv.dataset.lastSavedHtml = normalizarContenidoModuloPersistible(
            sanitizeRichText(contenidoDiv.innerHTML)
        );
    }

    await guardarModulo(moduloId, {
        ...payloadLocal,
        contenido: normalizarContenidoModuloPersistible(contenidoNormalizado)
    }, cursoIdModulo);

    const moduloActualizado = {
        ...modulo,
        ...payloadLocal,
        contenido: normalizarContenidoModuloPersistible(contenidoNormalizado)
    };

    if (typeof modulosCache?.set === "function" && typeof construirDocIdModulo === "function") {
        modulosCache.set(construirDocIdModulo(moduloId, cursoIdModulo), moduloActualizado);
    }

    if (subtemaActivo?.modulos && Array.isArray(subtemaActivo.modulos)) {
        const target = subtemaActivo.modulos.find((item) => String(item?.id || "").trim() === String(moduloId || "").trim());
        if (target) Object.assign(target, moduloActualizado);
    }

    if (typeof mostrarNotificacion === "function") {
        mostrarNotificacion(nuevaVisibilidad ? "Actividad original mostrada." : "Actividad original oculta.", "success");
    }
    } finally {
        botonesActividad.forEach((button) => {
            button.disabled = false;
            button.setAttribute("aria-disabled", "false");
            button.style.opacity = "";
            button.style.pointerEvents = "";
        });
        modulosActividadOriginalEnToggle.delete(moduloIdSafe);
    }
}

export function registrarToggleOriginalActivity(targetWindow, dependencies) {
    targetWindow.agregarActividadOriginalAlModulo = async function (moduloId) {
        const cursoIdModulo = String(dependencies?.getCursoIdModulo?.() || "").trim() || null;
        await toggleOriginalActivityVisibility({
            moduloId,
            cursoIdModulo,
            obtenerModulo: dependencies.obtenerModulo,
            sincronizarModuloLocal: dependencies.sincronizarModuloLocal,
            renderizarContenidoModulo: dependencies.renderizarContenidoModulo,
            normalizarContenidoModuloPersistible: dependencies.normalizarContenidoModuloPersistible,
            sanitizeRichText: dependencies.sanitizeRichText,
            guardarModulo: dependencies.guardarModulo,
            modulosCache: dependencies.modulosCache,
            construirDocIdModulo: dependencies.construirDocIdModulo,
            subtemaActivo: dependencies.getSubtemaActivo?.(),
            mostrarNotificacion: dependencies.mostrarNotificacion,
            helpers: dependencies.helpers || {}
        });
        dependencies.renderTemas?.();
    };
}
