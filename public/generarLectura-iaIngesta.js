
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
        txtIngesta.value = "";
        resultado.classList.add("hidden");
        btnContinuar.classList.add("hidden");
        loading.classList.add("hidden");
        listaResultados.innerHTML = "";
        analisisActual = [];
    }

    btnAnalizar?.addEventListener("click", async () => {
        const text = txtIngesta.value.trim();
        if (!text) {
            alert("Por favor pega algún texto para analizar.");
            return;
        }

        loading.classList.remove("hidden");
        resultado.classList.add("hidden");
        btnContinuar.classList.add("hidden");

        try {
            // 1. Obtener contexto de la secuencia activa para ayudar a Gemini
            const secuenciaDocs = await _obtenerSubtemasDisponibles();
            const subtemasStr = secuenciaDocs.map(s => `- ${s.subtema} (${s.categoria})`).join('\n');

            const prompt = `
            Eres un experto en diseño curricular. Analiza el siguiente texto y divídelo en fragmentos que correspondan a subcategorías pedagógicas.
            
            ${categoriaContexto ? `EL USUARIO ESTÁ ENFOCADO EN LA CATEGORÍA: "${categoriaContexto}". Prioriza subtemas de esta materia si es posible.` : ''}

            SUBTEMAS Y CATEGORÍAS DISPONIBLES EN EL SISTEMA:
            ${subtemasStr}
            
            INSTRUCCIÓN:
            1. Lee el texto e identifica fragmentos que hablen sobre los subtemas listados arriba.
            2. Si un fragmento no coincide exactamente, busca la categoría más cercana.
            3. Devuelve un JSON estrictamente estructurado como un array de objetos.
            
            OUTPUT ESPERADO (JSON):
            [
              {
                "subtema": "Nombre del subtema exacto o más cercano",
                "categoria": "Categoría (Materia)",
                "textoExtraido": "Fragmento del texto original que trata este tema",
                "justificacion": "Breve explicación de por qué corresponde a este subtema"
              }
            ]
            
            TEXTO A ANALIZAR:
            ${text}
            
            Responde ÚNICAMENTE con el bloque JSON.
            `;

            const rawResponse = await _llamarGeminiSimplificado(prompt);
            analisisActual = JSON.parse(rawResponse.replace(/```json\s?|```/g, "").trim());

            _mostrarResultadosAnalisis(analisisActual);
        } catch (error) {
            console.error("Error analizando ingesta:", error);
            alert("Hubo un error al analizar el texto con Gemini. Revisa la consola.");
        } finally {
            loading.classList.add("hidden");
        }
    });

    btnContinuar?.addEventListener("click", () => {
        const seleccionados = Array.from(document.querySelectorAll(".ingesta-check:checked")).map(chk => {
            return analisisActual[parseInt(chk.dataset.index)];
        });

        if (!seleccionados.length) {
            alert("Selecciona al menos un fragmento para continuar.");
            return;
        }

        // Proceder a la generación masiva
        _procesarGeneracionMasivaIA(seleccionados);
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

    function _mostrarResultadosAnalisis(analisis) {
        listaResultados.innerHTML = "";
        analisis.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-purple-300 transition-colors";
            card.innerHTML = `
                <input type="checkbox" checked class="ingesta-check mt-1" data-index="${index}">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-purple-700 uppercase tracking-wider">${item.categoria}</p>
                    <h5 class="text-sm font-bold text-slate-800 truncate">${item.subtema}</h5>
                    <p class="text-[11px] text-slate-500 line-clamp-2 mt-1">${item.textoExtraido}</p>
                </div>
            `;
            listaResultados.appendChild(card);
        });

        resultado.classList.remove("hidden");
        btnContinuar.classList.remove("hidden");
    }

    async function _procesarGeneracionMasivaIA(items) {
        // Cerrar este modal
        modal.style.display = "none";
        
        // 1. Asegurarnos de que el modal de la unidad esté abierto para poder manipular el DOM
        if (typeof window.abrirModalUnit === "function") {
            window.abrirModalUnit();
        } else {
            document.getElementById("btnAbrirModalUnidad")?.click();
        }

        // 2. Esperar a que el modal y la tabla se carguen
        let intentos = 0;
        const maxIntentos = 10;
        
        const interval = setInterval(() => {
            const container = document.getElementById("contenedorTablaSecuencia");
            if (container && container.querySelectorAll("tr").length > 3) {
                clearInterval(interval);
                _completarVinculacion(items);
            } else if (intentos >= maxIntentos) {
                clearInterval(interval);
                console.error("No se encontró la tabla de secuencia a tiempo.");
                if (window.mostrarNotificacion) window.mostrarNotificacion("❌ No se pudo sincronizar con la tabla. Ábrela e intenta de nuevo.", "error");
            }
            intentos++;
        }, 500);
    }

    function _completarVinculacion(items) {
        let vinculados = 0;
        
        for (const item of items) {
            const row = _buscarFilaPorSubtema(item.subtema, item.categoria);
            
            if (row) {
                // Marcar el checkbox de "generar"
                const chk = row.querySelector("input[name^='generar_']");
                if (chk) {
                    chk.checked = true;
                    // Disparar evento change para que el estado local se actualice
                    chk.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Obtener ID del módulo
                const moduloId = chk ? chk.name.replace("generar_", "") : null;
                if (moduloId) {
                    // Guardar instrucciones
                    localStorage.setItem(`instrucciones_gemini_${moduloId}`, item.textoExtraido);
                    
                    // Mostrar feedback visual
                    const btnGemini = row.querySelector(`[data-mc-action="abrir-instrucciones-gemini"]`);
                    if (btnGemini) {
                        btnGemini.classList.add("btn-gemini-active");
                        // Si existe FontAwesome
                        const icon = btnGemini.querySelector("i");
                        if (icon) icon.className = "fas fa-robot text-purple-600";
                    }
                    vinculados++;
                }
            }
        }

        if (window.mostrarNotificacion) {
            window.mostrarNotificacion(`✨ Vinculados ${vinculados} módulos con éxito. Revisa y genera la unidad.`, 'success');
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
