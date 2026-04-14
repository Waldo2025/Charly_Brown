
// generarLectura-iaIngesta.js
import { db, auth } from './generarLectura.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { buildApiUrl } from './api-client.js';

document.addEventListener("DOMContentLoaded", () => {
    const btnOpen = document.getElementById("btnIngestaMasivaIA");
    const modal = document.getElementById("modalIngestaMasivaIA");
    const btnCerrar = document.getElementById("cerrarModalIngestaIA");
    const btnCerrarLower = document.getElementById("btnCerrarIngestaIA");
    const btnAnalizar = document.getElementById("btnAnalizarIngestaIA");
    const btnContinuar = document.getElementById("btnContinuarIngestaIA");
    const txtIngesta = document.getElementById("txtIngestaIA");
    const loading = document.getElementById("loadingIngestaIA");
    const resultado = document.getElementById("resultadoAnalisisIA");
    const listaResultados = document.getElementById("listaSubcategoriasIA");

    let analisisActual = [];
    let categoriaContexto = "";

    // Abrir modal desde el botón lateral original
    btnOpen?.addEventListener("click", () => {
        categoriaContexto = "";
        modal.style.display = "flex";
    });

    // Delegación para botones dinámicos en la tabla de secuencia
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-ingesta-ia");
        if (btn) {
            categoriaContexto = btn.dataset.categoria || "";
            modal.style.display = "flex";
            if (window.mostrarNotificacion && categoriaContexto) {
                window.mostrarNotificacion(`🎯 Enfocando análisis en: ${categoriaContexto}`, 'info');
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
        resultado.classList.add("hidden");
        btnContinuar.classList.add("hidden");
        loading.classList.add("hidden");
        listaResultados.innerHTML = "";
        analisisActual = [];
    }

    btnAnalizar?.addEventListener("click", async () => {
        const text = txtIngesta.innerHTML.trim();
        if (!text || text === "<br>") {
            alert("Por favor pega algún texto para analizar.");
            return;
        }

        loading.classList.remove("hidden");
        resultado.classList.add("hidden");
        btnContinuar.classList.add("hidden");

        try {
            const prompt = `
            Eres un experto en diseño curricular. Analiza el siguiente texto y estructúralo adecuadamente en HTML.
            Tu objetivo es identificar y diferenciar claramente las siguientes partes basándote en el formato y contenido:
            - **Instrucción**: (Usa la clase <div class="instruccion">...</div>)
            - **Subinstrucción**: (Usa la clase <div class="sub-instruccion">...</div>)
            - **Respuesta (Answer)**: (Usa la clase <div class="answer">...</div>)

            No inventes ningún texto nuevo ni separes el texto en distintos subtemas.
            Solo reforma el texto original agregando estas clases HTML donde corresponda para indicar su estructura pedagógica.
            
            TEXTO A ANALIZAR:
            ${text}
            
            Responde ÚNICAMENTE con el bloque HTML estructurado (sin bloques delimitadores de markdown).
            `;

            const rawResponse = await _llamarGeminiSimplificado(prompt);
            analisisActual = rawResponse.replace(/```html\s?|```/gi, "").trim();

            const secuenciaDocs = await _obtenerSubtemasDisponibles();
            let subtemasFiltrados = secuenciaDocs;
            if (categoriaContexto) {
                subtemasFiltrados = secuenciaDocs.filter(s => s.categoria === categoriaContexto);
            }

            _mostrarSubcategoriasParaElegir(subtemasFiltrados);
        } catch (error) {
            console.error("Error analizando ingesta:", error);
            alert("Hubo un error al analizar el texto con Gemini. Revisa la consola.");
        } finally {
            loading.classList.add("hidden");
        }
    });

    btnContinuar?.addEventListener("click", () => {
        const seleccionado = document.querySelector(".ingesta-radio:checked");

        if (!seleccionado) {
            alert("Selecciona a qué única subcategoría corresponde este texto.");
            return;
        }

        const itemData = {
            subtema: seleccionado.value,
            categoria: seleccionado.dataset.categoria,
            textoExtraido: analisisActual
        };

        // Proceder a la generación única
        _procesarGeneracionUnicaIA(itemData);
    });

    async function _obtenerSubtemasDisponibles() {
        const snap = await getDocs(collection(db, "secuenciaAlcance"));
        const results = [];
        snap.forEach(d => {
            const data = d.data();
            // Buscar campos que terminen en _T (Título del subtema)
            Object.keys(data).forEach(key => {
                if (key.endsWith("_T") && data[key]) {
                    results.push({
                        categoria: key.replace("_T", ""),
                        subtema: data[key]
                    });
                }
            });
        });
        return results;
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
            return;
        }

        subtemas.forEach((sub) => {
            const card = document.createElement("label");
            card.className = "flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-purple-300 transition-colors cursor-pointer";
            card.innerHTML = `
                <input type="radio" name="subcategoriaSelect" value="${sub.subtema}" data-categoria="${sub.categoria}" class="ingesta-radio mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-purple-700 uppercase tracking-wider">${sub.categoria}</p>
                    <h5 class="text-sm font-bold text-slate-800 truncate">${sub.subtema}</h5>
                </div>
            `;
            listaResultados.appendChild(card);
        });

        resultado.classList.remove("hidden");
        btnContinuar.classList.remove("hidden");
    }

    async function _procesarGeneracionUnicaIA(item) {
        // Cerrar este modal
        modal.style.display = "none";
        
        // 1. Asegurarnos de que el modal de la unidad esté abierto
        if (typeof window.abrirModalUnit === "function") {
            window.abrirModalUnit();
        } else {
            document.getElementById("btnAbrirModalUnidad")?.click();
        }

        // 2. Esperar a que la tabla se cargue
        let intentos = 0;
        const maxIntentos = 10;
        
        const interval = setInterval(() => {
            const container = document.getElementById("contenedorTablaSecuencia");
            if (container && container.querySelectorAll("tr").length > 3) {
                clearInterval(interval);
                _ejecutarVinculacionYGeneracion(item);
            } else if (intentos >= maxIntentos) {
                clearInterval(interval);
                console.error("No se encontró la tabla de secuencia a tiempo.");
                if (window.mostrarNotificacion) window.mostrarNotificacion("❌ No se pudo sincronizar con la tabla. Ábrela e intenta de nuevo.", "error");
            }
            intentos++;
        }, 500);
    }

    function _ejecutarVinculacionYGeneracion(item) {
        const row = _buscarFilaPorSubtema(item.subtema, item.categoria);
        
        if (row) {
            // Desmarcar todos los demás en esa categoría
            const checksEnCategoria = document.querySelectorAll(`input[name^='generar_'][data-categoria="${item.categoria}"]`);
            checksEnCategoria.forEach(chk => {
                chk.checked = false;
                chk.dispatchEvent(new Event('change', { bubbles: true }));
            });

            // Marcar solo el seleccionado
            const chk = row.querySelector("input[name^='generar_']");
            if (chk) {
                chk.checked = true;
                chk.dispatchEvent(new Event('change', { bubbles: true }));

                const moduloId = chk.name.replace("generar_", "");
                // Guardar el HTML estructurado
                localStorage.setItem(`instrucciones_gemini_${moduloId}`, item.textoExtraido);

                const btnGemini = row.querySelector(`[data-mc-action="abrir-instrucciones-gemini"]`);
                if (btnGemini) {
                    btnGemini.classList.add("btn-gemini-active");
                    const icon = btnGemini.querySelector("i");
                    if (icon) icon.className = "fas fa-robot text-purple-600";
                }

                // Iniciar proceso de generación de la sección
                const btnGenerarCategoria = document.getElementById(`btn-generar-${item.categoria.replace(/\s+/g, '-')}`);
                if (btnGenerarCategoria) {
                    if (window.mostrarNotificacion) {
                        window.mostrarNotificacion(`🚀 Generando sección: ${item.categoria}...`, 'success');
                    }
                    setTimeout(() => {
                        btnGenerarCategoria.click();
                    }, 600);
                }
            }
        } else {
             if (window.mostrarNotificacion) window.mostrarNotificacion("❌ No se pudo encontrar la fila en la tabla.", "error");
        }
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
