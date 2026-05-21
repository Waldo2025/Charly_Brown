
// generarLectura-iaIngesta.js
import { db, auth } from './generarLectura.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { buildApiUrl } from './api-client.js';

document.addEventListener("DOMContentLoaded", () => {
    const btnOpen = document.getElementById("btnIngestaMasivaIA");
    const modal = document.getElementById("modalIngestaMasivaIA");
    const btnCerrar = document.getElementById("cerrarModalIngestaIA");
    const btnCerrarLower = document.getElementById("btnCerrarIngestaIA");
    const btnContinuar = document.getElementById("btnContinuarIngestaIA");
    const txtIngesta = document.getElementById("txtIngestaIA");
    const loading = document.getElementById("loadingIngestaIA");
    const resultado = document.getElementById("resultadoAnalisisIA");
    const listaResultados = document.getElementById("listaSubcategoriasIA");
    const ingestaSubcatCount = document.getElementById("ingestaSubcatCount");
    const ingestaSelectionLabel = document.getElementById("ingestaSelectionLabel");
    const fileInput = document.getElementById("fileIngestaDoc");

    let analisisActual = null;
    let categoriaContexto = "";

    txtIngesta?.addEventListener("input", () => {
        analisisActual = null;
    });

    fileInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        if (file.name.endsWith(".docx")) {
            reader.onload = function(event) {
                const arrayBuffer = event.target.result;
                if (typeof mammoth !== "undefined") {
                    if (window.mostrarNotificacion) {
                        window.mostrarNotificacion("📄 Procesando archivo Word...", "info");
                    }
                    mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                        .then(function(result) {
                            txtIngesta.innerHTML = result.value;
                            analisisActual = null;
                            txtIngesta.dispatchEvent(new Event("input", { bubbles: true }));
                            if (window.mostrarNotificacion) {
                                window.mostrarNotificacion("✅ Archivo Word cargado con estilos", "success");
                            }
                        })
                        .catch(function(err) {
                            console.error("Error al procesar Word con Mammoth:", err);
                            alert("No se pudo extraer la información del archivo Word.");
                        });
                } else {
                    alert("El motor Mammoth.js no está cargado.");
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (file.name.endsWith(".txt")) {
            reader.onload = function(event) {
                txtIngesta.innerHTML = event.target.result
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\n/g, "<br>");
                analisisActual = null;
                txtIngesta.dispatchEvent(new Event("input", { bubbles: true }));
                if (window.mostrarNotificacion) {
                    window.mostrarNotificacion("✅ Archivo de texto cargado", "success");
                }
            };
            reader.readAsText(file);
        } else {
            alert("Por favor selecciona un archivo .docx o .txt");
        }
    });

    async function openModalAndLoadOptions() {
        modal.style.display = "flex";
        resultado.classList.remove("hidden");
        btnContinuar.classList.remove("hidden");
        loading.classList.add("hidden");
        listaResultados.innerHTML = `<p class="text-slate-500 text-sm">Cargando subcategorías...</p>`;
        try {
            const secuenciaDocs = await _obtenerSubtemasDisponibles();
            let subtemasFiltrados = secuenciaDocs;
            if (categoriaContexto) {
                subtemasFiltrados = secuenciaDocs.filter((s) => s.categoria === categoriaContexto);
            }
            _mostrarSubcategoriasParaElegir(subtemasFiltrados);
        } catch (error) {
            console.error("Error cargando subcategorías de ingesta:", error);
            listaResultados.innerHTML = `<p class="text-rose-600 text-sm">No se pudo cargar la lista de subcategorías.</p>`;
            resultado.classList.remove("hidden");
            btnContinuar.classList.remove("hidden");
        }
    }

    // Abrir modal desde el botón lateral original
    btnOpen?.addEventListener("click", () => {
        categoriaContexto = "";
        openModalAndLoadOptions();
    });

    // Delegación para botones dinámicos en la tabla de secuencia
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-ingesta-ia");
        if (btn) {
            categoriaContexto = btn.dataset.categoria || "";
            openModalAndLoadOptions();
            if (window.mostrarNotificacion && categoriaContexto) {
                window.mostrarNotificacion(`🎯 Subcategorías cargadas para: ${categoriaContexto}`, 'info');
            }
        }
    });

    const closeMod = () => {
        modal.style.display = "none";
        resetUI();
    };

    btnCerrar?.addEventListener("click", closeMod);
    btnCerrarLower?.addEventListener("click", closeMod);

    function resetUI() {
        txtIngesta.innerHTML = "";
        resultado.classList.remove("hidden");
        btnContinuar.classList.remove("hidden");
        loading.classList.add("hidden");
        listaResultados.innerHTML = "";
        analisisActual = null;
        _actualizarResumenSeleccion();
    }

    function _actualizarResumenSeleccion() {
        const total = document.querySelectorAll(".ingesta-checkbox").length;
        const selected = document.querySelectorAll(".ingesta-checkbox:checked").length;
        if (ingestaSubcatCount) {
            ingestaSubcatCount.innerHTML = `<i class="fas fa-layer-group"></i> ${selected} seleccionada${selected === 1 ? "" : "s"}`;
        }
        if (ingestaSelectionLabel) {
            ingestaSelectionLabel.textContent = total
                ? `${selected} de ${total} subcategorías activas`
                : "Selecciona las subcategorías destino";
        }
    }

    function _normalizarContinuacionesDeRecursoEnHtmlAsc(html = "") {
        const source = String(html || "").trim();
        if (!source || typeof DOMParser === "undefined") return source;

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
        const root = doc.body.firstElementChild;
        if (!root) return source;

        const continuationRegex = /^(?:adem[aá]s|tambi[eé]n)\b/i;
        const resourceRegex = /\b(recortable|anexo|ficha|video)\b/i;
        const activities = Array.from(root.querySelectorAll(":scope > .activity"));
        let changed = false;

        activities.forEach((activity, index) => {
            if (!(activity instanceof Element) || index === 0) return;

            const firstParagraph = activity.querySelector(":scope > p");
            const previousActivity = activities[index - 1];
            const previousLead = previousActivity?.querySelector(":scope > p");
            if (!(firstParagraph instanceof Element) || !(previousLead instanceof Element)) return;

            const leadText = String(firstParagraph.textContent || "").replace(/\s+/g, " ").trim();
            if (!continuationRegex.test(leadText) || !resourceRegex.test(leadText)) return;

            const prevText = String(previousLead.textContent || "").replace(/\s+/g, " ").trim();
            if (!prevText || prevText.includes(leadText)) return;

            previousLead.appendChild(doc.createTextNode(` ${leadText}`));
            firstParagraph.remove();
            changed = true;

            const hasVisibleContent = Array.from(activity.children).some((child) => {
                if (!(child instanceof Element)) return false;
                const text = String(child.textContent || "").replace(/\s+/g, " ").trim();
                return !!text;
            });
            if (!hasVisibleContent) {
                activity.remove();
            }
        });

        return changed ? root.innerHTML.trim() : source;
    }

    async function _prepararTextoConGeminiSiHaceFalta({ force = false } = {}) {
        const textHtml = txtIngesta.innerHTML.trim();
        const plainText = String(txtIngesta.textContent || "").trim();
        if ((!textHtml || textHtml === "<br>") && !plainText) {
            alert("Por favor pega algún texto para analizar.");
            return null;
        }

        if (!force && analisisActual?.structuredHtml && analisisActual?.originalHtml === textHtml) {
            return analisisActual;
        }

        loading.classList.remove("hidden");

        try {
            const prompt = `
            Eres un experto en normalización de actividades escolares al formato ASC.
            Analiza el siguiente texto y SOLO organízalo en HTML ASC, sin inventar, ampliar, resumir ni cambiar el contenido pedagógico.
            
            Tu trabajo es decidir y estructurar, a partir del texto fuente:
            1. Título principal: Identifica el título de la lectura o del subtema. A veces viene precedido de la palabra "Título:", "Title:", "0100TITULO" o simplemente es la primera línea del texto que resalta. Conviértela SIEMPRE en una etiqueta <h3>...</h3> al inicio del HTML.
            2. Actividades principales: Envuelve cada actividad principal identificada en un elemento <div class="activity">.
            3. Instrucción principal: La instrucción de cada actividad debe estar en un párrafo en negrita: <p><strong>...</strong></p>.
            4. Pasos o subinstrucciones: Si la actividad contiene incisos, pasos, preguntas secundarias o listados, organízalos obligatoriamente en una única lista ordenada continua: <ol class="steps" type="a"><li>...</li></ol>. No crees múltiples listas <ol> separadas para la misma actividad, todo debe pertenecer a la misma lista continua.
            5. Respuestas esperadas: Si hay respuestas en el texto (por ejemplo, al lado de la pregunta o debajo de ella, o etiquetadas como "Respuesta: ...", "Respuesta personal", "R. ejemplo: ...", etc.), colócalas en un bloque <div class="answer"><span style="color:mediumvioletred;">...</span></div> obligatoriamente anidado y ubicado DENTRO del mismo elemento <li> de ese paso (es decir, justo al final del contenido del <li>, antes de la etiqueta de cierre </li>). NUNCA cierres la etiqueta </ol> ni rompas la lista para colocar la respuesta fuera de ella. Toda la lista debe ser continua con las respuestas dentro de sus respectivos incisos.
            6. Habilidad cognitiva asociada: Si en el texto original se especifica la habilidad cognitiva (por ejemplo, una línea con "DUM", "ERS", "DCS" o similar), consérvala intacta al principio del texto de salida de forma visible, por ejemplo: "Habilidad cognitiva asociada: DUM", de tal forma que el analizador la encuentre fácilmente. ¡NUNCA omitas, cambies o ignores esta habilidad!
            
            Reglas absolutas:
            - NO inventes texto nuevo.
            - NO omitas ninguna instrucción, pregunta ni respuesta del texto fuente.
            - Conserva todas las actividades originales exactamente.
            - Respeta estrictamente el orden físico y cronológico original de las actividades y preguntas. La Actividad 1 debe ir primero, luego la Actividad 2, luego la Actividad 3. NUNCA reordenes las actividades físicamente de forma diferente a como aparecen en el texto original.
            - Si una línea empieza con "Además," o "También," y solo amplía la instrucción anterior con un recurso como recortable, anexo, ficha o video, no la conviertas en una actividad nueva ni en un bloque separado: debe quedar unida al mismo párrafo principal de la actividad anterior.
            - Devuelve ÚNICAMENTE el bloque HTML resultante (sin bloques delimitadores de markdown \`\`\`html o similares).
            
            TEXTO A ANALIZAR:
            ${textHtml}
            `;

            const rawResponse = await _llamarGeminiSimplificado(prompt);
            const structuredHtml = _normalizarContinuacionesDeRecursoEnHtmlAsc(
                rawResponse.replace(/```html\s?|```/gi, "").trim() || textHtml
            );
            analisisActual = {
                originalHtml: textHtml,
                plainText,
                structuredHtml
            };
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion("✅ Texto preparado. Ahora inicia el proceso con las subcategorías elegidas.", "success");
            }
            return analisisActual;
        } catch (error) {
            console.error("Error analizando ingesta:", error);
            alert("Hubo un error al analizar el texto con Gemini. Revisa la consola.");
            return null;
        } finally {
            loading.classList.add("hidden");
            resultado.classList.remove("hidden");
            btnContinuar.classList.remove("hidden");
        }
    }

    btnContinuar?.addEventListener("click", async () => {
        const seleccionados = Array.from(document.querySelectorAll(".ingesta-checkbox:checked"));

        if (!seleccionados.length) {
            alert("Selecciona al menos una subcategoría para iniciar el proceso.");
            return;
        }

        const prepared = await _prepararTextoConGeminiSiHaceFalta();
        if (!prepared && !String(txtIngesta.innerHTML || "").trim() && !String(txtIngesta.textContent || "").trim()) {
            return;
        }

        const items = seleccionados.map((node) => ({
            subtema: node.value,
            categoria: node.dataset.categoria,
            textoExtraido: prepared?.structuredHtml || analisisActual?.structuredHtml || txtIngesta.innerHTML.trim() || "",
            textoOriginalHtml: prepared?.originalHtml || analisisActual?.originalHtml || txtIngesta.innerHTML.trim() || "",
            textoPlano: prepared?.plainText || analisisActual?.plainText || String(txtIngesta.textContent || "").trim()
        }));

        _procesarGeneracionMultipleIA(items);
    });

    function _obtenerSubtemasDesdeTablaActual() {
        const container = document.getElementById("contenedorTablaSecuencia");
        if (!container) return [];

        const rows = Array.from(container.querySelectorAll("tr"));
        const dedup = new Map();

        rows.forEach((row) => {
            const chk = row.querySelector("input[name^='generar_'][data-subtema]");
            if (!chk) return;
            const categoria = String(chk.dataset.categoria || "").trim();
            const subtemaRaw = String(chk.dataset.subtema || "").trim();
            const subtemaVisual = String(row.querySelector("h3")?.textContent || subtemaRaw).trim();
            if (!categoria || !subtemaVisual) return;
            const key = `${_normalizar(categoria)}::${_normalizar(subtemaRaw || subtemaVisual)}`;
            if (!dedup.has(key)) {
                dedup.set(key, {
                    categoria,
                    subtema: subtemaRaw || subtemaVisual,
                    etiqueta: subtemaVisual
                });
            }
        });

        return Array.from(dedup.values());
    }

    function _obtenerSubtemasDesdeMapaGlobal() {
        const mapa = window.categoriaPorSubtema || {};
        const dedup = new Map();

        Object.entries(mapa).forEach(([subtema, categoria]) => {
            const categoriaSafe = String(categoria || "").trim();
            const subtemaSafe = String(subtema || "").trim();
            if (!categoriaSafe || !subtemaSafe) return;
            const key = `${_normalizar(categoriaSafe)}::${_normalizar(subtemaSafe)}`;
            if (!dedup.has(key)) {
                dedup.set(key, {
                    categoria: categoriaSafe,
                    subtema: subtemaSafe,
                    etiqueta: subtemaSafe.replace(/([a-z])([A-Z])/g, "$1 $2")
                });
            }
        });

        return Array.from(dedup.values());
    }

    async function _obtenerSubtemasDisponibles() {
        const desdeTabla = _obtenerSubtemasDesdeTablaActual();
        if (desdeTabla.length) return desdeTabla;

        const desdeMapaGlobal = _obtenerSubtemasDesdeMapaGlobal();
        if (desdeMapaGlobal.length) return desdeMapaGlobal;

        const snap = await getDocs(collection(db, "secuenciaAlcance"));
        const dedup = new Map();
        snap.forEach(d => {
            const data = d.data();
            Object.keys(data).forEach(key => {
                if (key.endsWith("_T") && data[key]) {
                    const categoria = key.replace("_T", "");
                    const subtema = String(data[key] || "").trim();
                    if (!categoria || !subtema) return;
                    const dedupKey = `${_normalizar(categoria)}::${_normalizar(subtema)}`;
                    if (!dedup.has(dedupKey)) {
                        dedup.set(dedupKey, {
                            categoria,
                            subtema,
                            etiqueta: subtema
                        });
                    }
                }
            });
        });
        return Array.from(dedup.values());
    }

    async function _llamarGeminiSimplificado(prompt) {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado");
        const token = await user.getIdToken();

        const response = await fetch(buildApiUrl("/api/gemini/generate"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                model: "gemini-2.5-flash-lite",
                payload: {
                    contents: [{ role: "user", parts: [{ text: prompt }] }]
                }
            })
        });

        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    function _mostrarSubcategoriasParaElegir(subtemas) {
        listaResultados.innerHTML = "";
        
        if (!subtemas || !subtemas.length) {
            listaResultados.innerHTML = `<p class="text-slate-500 text-sm">No hay subcategorías disponibles para mostrar.</p>`;
            resultado.classList.remove("hidden");
            btnContinuar.classList.add("hidden");
            _actualizarResumenSeleccion();
            return;
        }

        subtemas.forEach((sub) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "ingesta-subcat-card";
            card.setAttribute("aria-pressed", "false");
            card.innerHTML = `
                <input type="checkbox" name="subcategoriaSelect" value="${sub.subtema}" data-categoria="${sub.categoria}" class="ingesta-checkbox">
                <div class="ingesta-subcat-top">
                    <span class="ingesta-subcat-categoria">${sub.categoria}</span>
                    <span class="ingesta-subcat-check"><i class="fas fa-check"></i></span>
                </div>
                <h5 class="ingesta-subcat-name">${sub.etiqueta || sub.subtema}</h5>
                <p class="ingesta-subcat-helper">Usar este texto como base de la subcategoría ${sub.etiqueta || sub.subtema}.</p>
            `;
            const checkbox = card.querySelector(".ingesta-checkbox");
            const syncState = () => {
                const active = !!checkbox?.checked;
                card.classList.toggle("is-selected", active);
                card.setAttribute("aria-pressed", active ? "true" : "false");
            };
            card.addEventListener("click", () => {
                if (!checkbox) return;
                checkbox.checked = !checkbox.checked;
                syncState();
                _actualizarResumenSeleccion();
            });
            syncState();
            listaResultados.appendChild(card);
        });

        resultado.classList.remove("hidden");
        btnContinuar.classList.remove("hidden");
        _actualizarResumenSeleccion();
    }

    function _storageKeyForImportedText(categoria = "", subtema = "") {
        const normalizeStorage = (value = "") => String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        return `unidad_ingesta_texto_${normalizeStorage(categoria)}__${normalizeStorage(subtema)}`;
    }

    function _hayLecturaSeleccionadaParaUnidad() {
        const lecturaPrincipalId = String(document.getElementById("tema")?.value || "").trim();
        const lecturaAscId = String(document.getElementById("temaASC")?.value || "").trim();
        const lecturaPrompt = !!window.lecturaNuevaCoincidenteGlobal;
        const lecturaCache = (() => {
            try {
                return !!JSON.parse(localStorage.getItem("cb_lectura_cache_v1") || "null")?.id;
            } catch (_) {
                return false;
            }
        })();
        return !!(lecturaPrincipalId || lecturaAscId || lecturaPrompt || lecturaCache);
    }

    async function _esperarControlesCategoria({ categorias = [], timeoutMs = 15000 } = {}) {
        const startedAt = Date.now();
        while ((Date.now() - startedAt) < timeoutMs) {
            const listas = categorias.every((categoria) => {
                const safeCategoria = String(categoria || "").trim();
                if (!safeCategoria) return false;
                return !!document.querySelector(`.btn-icono-categoria.generar[data-categoria="${safeCategoria}"]`);
            });
            if (listas) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return false;
    }

    async function _procesarGeneracionMultipleIA(items = []) {
        if (!_hayLecturaSeleccionadaParaUnidad()) {
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion("⚠️ Antes de iniciar este proceso debes seleccionar una lectura para la unidad.", "warning");
            } else {
                alert("Antes de iniciar este proceso debes seleccionar una lectura para la unidad.");
            }
            return;
        }

        // Cerrar este modal
        modal.style.display = "none";
        
        // 1. Asegurarnos de que el modal/configuración de la unidad esté disponible
        if (typeof window.abrirGenerarUnidadNuevaSeccion === "function") {
            window.abrirGenerarUnidadNuevaSeccion();
        } else if (typeof window.abrirModalUnit === "function") {
            window.abrirModalUnit();
        } else {
            document.getElementById("btnAbrirModalUnidad")?.click();
        }

        // 2. Abrir explícitamente el modal de resultados sin borrar lo ya generado.
        // Solo debe reemplazarse la misma subcategoría cuando se regenere ese bloque.
        if (typeof window.abrirModalResultadoUnidad === "function") {
            window.abrirModalResultadoUnidad();
        } else {
            const modalResultado = document.getElementById("modalResultadoUnidad");
            if (modalResultado) modalResultado.style.display = "block";
        }

        // 3. Forzar carga de secuencia y esperar el estado real
        if (typeof window.verificarSecuencia === "function") {
            try {
                await window.verificarSecuencia();
            } catch (error) {
                console.warn("verificarSecuencia falló durante la ingesta:", error);
            }
        }

        const categoriasObjetivo = Array.from(new Set(items.map((item) => String(item?.categoria || "").trim()).filter(Boolean)));
        let controlesListos = await _esperarControlesCategoria({ categorias: categoriasObjetivo, timeoutMs: 15000 });
        if (!controlesListos && typeof window.verificarSecuencia === "function") {
            try {
                await window.verificarSecuencia();
            } catch (_) {
                // noop
            }
            controlesListos = await _esperarControlesCategoria({ categorias: categoriasObjetivo, timeoutMs: 10000 });
        }

        if (!controlesListos) {
            console.error("No se encontraron los controles de generación de categoría a tiempo.");
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion("❌ No se pudo preparar el flujo de Generar sección. Revisa que la unidad tenga nivel, grado, trimestre y unidad seleccionados.", "error");
            }
            return;
        }

        _ejecutarVinculacionYGeneracion(items);
    }

    function _ejecutarVinculacionYGeneracion(items = []) {
        if (!Array.isArray(items) || !items.length) return;

        const categoriasAProcesar = new Set();
        const categoriasVistas = new Set();

        items.forEach((item) => {
            if (!item?.categoria || categoriasVistas.has(item.categoria)) return;
            categoriasVistas.add(item.categoria);
            const checksEnCategoria = document.querySelectorAll(`input[name^='generar_'][data-categoria="${item.categoria}"]`);
            checksEnCategoria.forEach((chk) => {
                chk.checked = false;
                chk.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });

        let subtemasEncontrados = 0;

        items.forEach((item) => {
            const chk = document.querySelector(`input[name="generar_${item.subtema}"]`);
            if (!chk) return;

            subtemasEncontrados += 1;
            chk.checked = true;
            chk.dispatchEvent(new Event('change', { bubbles: true }));

            window.__unidadTextoImportadoPorSubtema = window.__unidadTextoImportadoPorSubtema || {};
            const importedPayload = {
                categoria: item.categoria,
                subtema: item.subtema,
                originalHtml: item.textoOriginalHtml || "",
                plainText: item.textoPlano || "",
                structuredHtml: item.textoExtraido || "",
                createdAt: Date.now(),
                mode: "reuse-pasted-text"
            };
            window.__unidadTextoImportadoPorSubtema[_storageKeyForImportedText(item.categoria, item.subtema)] = importedPayload;

            localStorage.setItem(
                _storageKeyForImportedText(item.categoria, item.subtema),
                JSON.stringify(importedPayload)
            );

            const btnInstrucciones = document.getElementById(`btn-instrucciones-${item.categoria.replace(/\s+/g, '-')}`);
            if (btnInstrucciones) {
                btnInstrucciones.classList.add("has-instructions");
            }

            categoriasAProcesar.add(item.categoria);
        });

        if (!subtemasEncontrados) {
            if (window.mostrarNotificacion) window.mostrarNotificacion("❌ No se pudieron activar las subcategorías seleccionadas para Generar sección.", "error");
            return;
        }

        Array.from(categoriasAProcesar).forEach((categoria, index) => {
            const btnGenerarCategoria = document.getElementById(`btn-generar-${categoria.replace(/\s+/g, '-')}`);
            if (!btnGenerarCategoria) return;
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion(`🚀 Preparando generación desde texto para: ${categoria}`, 'success');
            }
            setTimeout(() => {
                btnGenerarCategoria.dataset.isIngestaIA = "true";
                btnGenerarCategoria.click();
            }, 600 + (index * 500));
        });
    }

    function _buscarFilaPorSubtema(subtemaBuscado, categoriaBuscada) {
        const container = document.getElementById("contenedorTablaSecuencia");
        if (!container) return null;

        const rows = Array.from(container.querySelectorAll("tr"));
        const subtemaNorm = _normalizar(subtemaBuscado);
        const catNorm = _normalizar(categoriaBuscada);

        let bestMatch = null;
        let maxScore = 0;

        for (const r of rows) {
            const h3 = r.querySelector("h3");
            const catLabel = r.querySelector(".categoria-label") || r.cells?.[1]; 
            
            const txt = _normalizar(h3?.textContent || "");
            const cat = _normalizar(catLabel?.textContent || "");

            let score = 0;
            if (txt === subtemaNorm) score += 10;
            else if (txt.includes(subtemaNorm) || subtemaNorm.includes(txt)) score += 5;
            
            if (cat === catNorm) score += 3;
            else if (cat.includes(catNorm)) score += 1;

            if (score > maxScore) {
                maxScore = score;
                bestMatch = r;
            }
        }

        return maxScore >= 5 ? bestMatch : null;
    }

    function _normalizar(t) {
        return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }
});
