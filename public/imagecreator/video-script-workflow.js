import { authFetchJson, buildGeminiApiUrl } from "../js/api-client.js";
import { generateImagesViaGemini } from "./api.js?v=2026-09-11.1";
import { uploadGeneratedResults } from "./assets-store.js";
import { auth, db } from "../js/firebase-instance.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  buildNewPodcasterVideoSession,
  buildPodcasterReferenceMaps,
  getPodcasterSessionRows,
  planPodcasterReferenceTransfer,
  validateApprovedSceneImages
} from "./podcaster-reference-transfer.js";
import {
  saveSceneBlob,
  getSceneBlob,
  getAllSceneBlobsForScript,
  saveScriptCheckpoint,
  getScriptCheckpoint,
  clearScriptCheckpoint,
  dataUrlToBlob,
  blobToDataUrl
} from "./scene-blob-store.js";

const PODCASTER_VIDEO_IMPORT_STORAGE_KEY = "cb_podcaster_video_import_v1";

function escapeHtml(str = "") {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class VideoScriptWorkflow {
  constructor({ state, elements, renderAll, persistActiveSession }) {
    this.state = state;
    this.elements = elements;
    this.renderAll = renderAll;
    this.persistActiveSession = persistActiveSession;

    this.currentScript = null; // { scenes: [] }
    this.lastRenderedScenes = [];
    this.configuredStyle = "realista";
    this.currentSceneIndex = 0;
    this.sceneImages = []; // [{ sceneIndex, dataUrl, mimeType, id }]
    this.currentGeneratedResult = null;
    this.uploadedResults = [];
    this.characterConsistent = false;
    this.scriptCharacter = null;
    this.pendingCharacterResult = null;

    this.cleanupLegacyLocalStorageBloat();
    this.initSceneStudioModal();
    this.bindGlobalToolbarEvents();
  }

  cleanupLegacyLocalStorageBloat() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("lucy_studio_cache_")) {
          const val = localStorage.getItem(k);
          if (val && val.includes("data:image/")) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      if (keysToRemove.length) {
        console.info(`[Lucy Studio] Limpiadas ${keysToRemove.length} entradas de imágenes pesadas en localStorage.`);
      }
    } catch (_) {}
  }

  initSceneStudioModal() {
    let modal = document.getElementById("icSceneStudioModal");
    if (modal) return;

    modal = document.createElement("div");
    modal.id = "icSceneStudioModal";
    modal.className = "ic-modal-backdrop hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Estudio de Generación de Escenas");

    modal.innerHTML = `
      <div class="ic-scene-studio-card">
        <header class="ic-studio-header">
          <div class="ic-studio-header-title">
            <i class="fa-solid fa-clapperboard"></i>
            <span>Estudio de Escenas · Generación de Referencias</span>
          </div>
          <div class="ic-studio-header-meta" style="display: flex; align-items: center; gap: 8px;">
            <button type="button" id="icStudioHeaderExportBtn" class="ic-studio-btn-sm ic-studio-btn-primary hidden" title="Exportar guion y escenas a Podcaster">
              <i class="fa-solid fa-clapperboard"></i>
              <span>Usar en Podcaster</span>
            </button>
            <button type="button" id="icStudioToggleViewBtn" class="ic-studio-btn-sm ic-studio-btn-ghost" title="Alternar entre Inspector y Galería de Escenas">
              <i class="fa-solid fa-table-cells-large"></i>
              <span id="icStudioToggleViewText">Ver Galería</span>
            </button>
            <span class="ic-studio-counter-pill" id="icStudioCounterPill">
              Escena <strong id="icStudioCurrentNum">1</strong> de <strong id="icStudioTotalNum">1</strong>
            </span>
            <button type="button" id="icStudioCloseBtn" class="ic-studio-close-btn" aria-label="Cerrar estudio" title="Cerrar estudio">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <div class="ic-studio-body" id="icStudioActiveView">
          <!-- Columna Izquierda: Vista previa de imagen / Stage -->
          <div class="ic-studio-left-col">
            <div class="ic-studio-stage-box" id="icStudioStage">
              <!-- Estado Inicial: Sin imagen -->
              <div class="ic-studio-placeholder" id="icStudioPlaceholder">
                <div class="ic-studio-placeholder-icon">
                  <i class="fa-solid fa-image"></i>
                </div>
                <h4>Escena lista para generar</h4>
                <p>Genera la imagen de referencia para esta escena según el guion y estilo seleccionado.</p>
                <div class="ic-studio-placeholder-actions" style="display: flex; gap: 8px; justify-content: center; margin-top: 10px;">
                  <button type="button" id="icStudioGenerateBtn" class="ic-studio-generate-btn">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Crear Imagen</span>
                  </button>
                  <button type="button" id="icStudioPlaceholderBatchBtn" class="ic-studio-btn ic-studio-btn-secondary hidden">
                    <i class="fa-solid fa-play"></i>
                    <span id="icStudioPlaceholderBatchText">Generar las que faltan</span>
                  </button>
                </div>
              </div>

              <!-- Estado Generando: Spinner / Loader -->
              <div class="ic-studio-loading hidden" id="icStudioLoading">
                <div class="ic-studio-loader-brand">
                  <img src="imagecreator/lucyStudio1.png" alt="Lucy Studio" class="ic-studio-loader-logo">
                  <div class="ic-studio-loader-ring" aria-hidden="true"></div>
                </div>
                <span>Creando imagen con Lucy Studio...</span>
              </div>

              <!-- Estado Imagen Generada: Preview -->
              <div class="ic-studio-result-view hidden" id="icStudioResultView">
                <img id="icStudioResultImg" src="" alt="Escena generada" class="ic-studio-img">
              </div>
            </div>

            <!-- Toolbar de acciones de la imagen (visible tras generar) -->
            <div class="ic-studio-action-toolbar hidden" id="icStudioToolbar">
              <button type="button" id="icStudioRegenerateBtn" class="ic-studio-btn ic-studio-btn-secondary">
                <i class="fa-solid fa-rotate"></i>
                <span>Regenerar</span>
              </button>
              <button type="button" id="icStudioApproveBtn" class="ic-studio-btn ic-studio-btn-primary">
                <i class="fa-solid fa-check"></i>
                <span id="icStudioApproveText">Aprobar Escena</span>
              </button>
            </div>
          </div>

          <!-- Columna Derecha: Panel de Datos de la Escena -->
          <div class="ic-studio-right-col">
            <div class="ic-studio-data-scroll">
              <div class="ic-studio-field-row">
                <span class="ic-studio-field-label"><i class="fa-solid fa-clock"></i> Tiempo</span>
                <span class="ic-studio-badge" id="icStudioDataTiempo">8 segundos</span>
              </div>

              <div class="ic-studio-field-group">
                <span class="ic-studio-field-label"><i class="fa-solid fa-microphone-lines"></i> Guion (Voz en off / Hook)</span>
                <textarea id="icStudioDataGuion" class="ic-studio-textarea" rows="2" placeholder="Frase o voz en off..."></textarea>
              </div>

              <div class="ic-studio-field-group">
                <span class="ic-studio-field-label"><i class="fa-solid fa-camera"></i> Descripción de Escena</span>
                <textarea id="icStudioDataDescripcion" class="ic-studio-textarea" rows="3" placeholder="Descripción visual de la escena..."></textarea>
              </div>

              <div class="ic-studio-field-group">
                <span class="ic-studio-field-label"><i class="fa-solid fa-font"></i> Texto en Pantalla</span>
                <input type="text" id="icStudioDataTexto" class="ic-studio-input" placeholder="Texto o título que debe aparecer en pantalla...">
              </div>

              <div class="ic-studio-field-group">
                <span class="ic-studio-field-label"><i class="fa-solid fa-film"></i> Elemento Visual / Acción</span>
                <textarea id="icStudioDataElemento" class="ic-studio-textarea" rows="2" placeholder="Acción de cámara o elemento específico..."></textarea>
              </div>

              <div class="ic-studio-field-group">
                <span class="ic-studio-field-label"><i class="fa-solid fa-palette"></i> Estilo Visual</span>
                <select id="icStudioDataStyle" class="ic-studio-select">
                  <option value="realista" selected>Realista (Cinemático y detallado)</option>
                  <option value="animacion_3d">Animación 3D (Pixar / Disney 3D)</option>
                  <option value="caricatura_moderna">Caricatura Moderna (Ilustración flat vector)</option>
                  <option value="cinematico">Cinemático (Iluminación dramática de cine)</option>
                  <option value="stick_draw">Stick Draw (Boceto minimalista)</option>
                  <option value="otro">Estilo libre</option>
                </select>
              </div>

              <!-- Bloque: Coherencia de Personaje en el Guion -->
              <div class="ic-studio-field-group ic-studio-character-section">
                <div class="ic-studio-field-row">
                  <label class="ic-studio-switch-label" for="icStudioCharacterToggle">
                    <input type="checkbox" id="icStudioCharacterToggle" class="ic-studio-checkbox">
                    <span class="ic-studio-field-label"><i class="fa-solid fa-user-astronaut"></i> Personaje Consistente</span>
                  </label>
                  <span class="ic-studio-badge" id="icStudioCharacterStatus">Desactivado</span>
                </div>

                <div id="icStudioCharacterBox" class="ic-studio-character-box hidden">
                  <div id="icStudioCharacterSetup" class="ic-studio-character-setup">
                    <div style="font-size: 11px; color: var(--ic-muted); margin-bottom: 4px;">
                      Define el personaje que aparecerá en las escenas de este video:
                    </div>
                    <textarea id="icStudioCharacterDesc" class="ic-studio-textarea" rows="2" placeholder="Ej: Sofía, joven bióloga con bata y chaleco safari..."></textarea>
                    <div class="ic-studio-character-actions" style="margin-top: 6px; display: flex; gap: 8px;">
                      <button type="button" id="icStudioGenCharacterBtn" class="ic-studio-btn-sm ic-studio-btn-accent">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <span id="icStudioGenCharacterText">Crear Personaje</span>
                      </button>
                    </div>
                  </div>

                  <!-- Vista previa del personaje generado para aprobar -->
                  <div id="icStudioCharacterPreview" class="ic-studio-character-preview hidden">
                    <div class="ic-studio-character-thumb-wrap">
                      <img id="icStudioCharacterImg" src="" alt="Personaje de referencia" class="ic-studio-character-thumb">
                    </div>
                    <div class="ic-studio-character-preview-info">
                      <strong id="icStudioCharacterName">Personaje de Referencia</strong>
                      <div class="ic-studio-character-preview-actions">
                        <button type="button" id="icStudioApproveCharacterBtn" class="ic-studio-btn-sm ic-studio-btn-success">
                          <i class="fa-solid fa-check"></i>
                          <span>Aprobar y Usar</span>
                        </button>
                        <button type="button" id="icStudioRetryingCharacterBtn" class="ic-studio-btn-sm ic-studio-btn-ghost">
                          <i class="fa-solid fa-rotate-left"></i>
                          <span>Cambiar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Vista de Finalización: Cuando se aprueban todas las escenas -->
        <div class="ic-studio-completion-view hidden" id="icStudioCompletionView">
          <div class="ic-studio-completion-card">
            <div class="ic-studio-success-icon">
              <i class="fa-solid fa-circle-check"></i>
            </div>
            <h3>¡Todas las imágenes del guion han sido aprobadas!</h3>
            <p id="icStudioCompletionSummary">Se generaron y aprobaron todas las imágenes de referencia listas para Podcaster.</p>
            <div class="ic-studio-completion-actions" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
              <button type="button" id="icStudioFinishExportBtn" class="ic-studio-btn ic-studio-btn-primary">
                <i class="fa-solid fa-clapperboard"></i>
                <span>Usar en Podcaster &amp; Snoopy Editor</span>
              </button>
              <button type="button" id="icStudioFinishZipBtn" class="ic-studio-btn ic-studio-btn-secondary">
                <i class="fa-solid fa-file-zipper"></i>
                <span>Descargar ZIP con Imágenes</span>
              </button>
              <button type="button" id="icStudioCompletionToGalleryBtn" class="ic-studio-btn ic-studio-btn-ghost">
                <i class="fa-solid fa-table-cells-large"></i>
                <span>Ver Galería</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Vista Galería de Escenas: Miniaturas Medianas Seleccionables -->
        <div class="ic-studio-gallery-view hidden" id="icStudioGalleryView">
          <div class="ic-gallery-grid" id="icGalleryGrid">
            <!-- Renderizado dinámico de tarjetas 16:9 -->
          </div>
        </div>

        <!-- Footer Permanente del Modal con las Acciones de Galería -->
        <footer class="ic-studio-modal-footer hidden" id="icStudioModalFooter">
          <div class="ic-gallery-selection-meta">
            <label class="ic-gallery-select-all-label" for="icGallerySelectAllCheckbox">
              <input type="checkbox" id="icGallerySelectAllCheckbox" class="ic-studio-checkbox">
              <span>Seleccionar Todo</span>
            </label>
            <span id="icGallerySelectionCount" class="ic-studio-badge">0 seleccionadas</span>
          </div>

          <div class="ic-studio-footer-actions">
            <button type="button" id="icGalleryBackToInspectorBtn" class="ic-studio-btn ic-studio-btn-ghost">
              <i class="fa-solid fa-sliders"></i>
              <span>Modo Inspector</span>
            </button>
            <button type="button" id="icStudioBatchGenAllBtn" class="ic-studio-btn ic-studio-btn-accent" title="Generar escenas automáticamente en segundo plano con Lucy Studio">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span id="icStudioBatchGenAllText">Generar Todas</span>
            </button>
            <button type="button" id="icStudioBatchRegenAllBtn" class="ic-studio-btn ic-studio-btn-secondary hidden" title="Regenerar todas las escenas desde cero">
              <i class="fa-solid fa-rotate-left"></i>
              <span>Regenerar Todas</span>
            </button>
            <button type="button" id="icGalleryRegenSelectedBtn" class="ic-studio-btn ic-studio-btn-secondary" disabled>
              <i class="fa-solid fa-rotate-left"></i>
              <span id="icGalleryRegenSelectedText">Regenerar Seleccionadas</span>
            </button>
            <button type="button" id="icGalleryApproveSelectedBtn" class="ic-studio-btn ic-studio-btn-success" disabled>
              <i class="fa-solid fa-check"></i>
              <span id="icGalleryApproveSelectedText">Aprobar Seleccionadas</span>
            </button>
            <button type="button" id="icStudioBatchApproveAllBtn" class="ic-studio-btn ic-studio-btn-success hidden" title="Aprobar todas las escenas generadas y guardarlas en Firebase">
              <i class="fa-solid fa-check-double"></i>
              <span>Aprobar Todas y Guardar</span>
            </button>
            <button type="button" id="icGalleryFinishBtn" class="ic-studio-btn ic-studio-btn-primary">
              <i class="fa-solid fa-clapperboard"></i>
              <span>Finalizar y Exportar</span>
            </button>
          </div>
        </footer>

        <!-- Overlay de Progreso en Lote -->
        <div class="ic-studio-batch-overlay hidden" id="icStudioBatchOverlay">
          <div class="ic-studio-batch-modal">
            <div class="ic-studio-loader-brand">
              <img src="imagecreator/lucyStudio1.png" alt="Lucy Studio" class="ic-studio-loader-logo">
              <div class="ic-studio-loader-ring" aria-hidden="true"></div>
            </div>
            <h4 id="icStudioBatchTitle">Generando escenas con Lucy Studio...</h4>
            <p id="icStudioBatchSubtitle">Procesando imágenes en paralelo según los requerimientos del guion.</p>
            <div class="ic-studio-progress-track">
              <div class="ic-studio-progress-fill" id="icStudioBatchProgressFill" style="width: 0%;"></div>
            </div>
            <span class="ic-studio-progress-text" id="icStudioBatchProgressText">0 / 0 completadas</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#icStudioCloseBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    modal.querySelector("#icStudioGenerateBtn")?.addEventListener("click", () => {
      void this.generateCurrentImageForStudio();
    });

    modal.querySelector("#icStudioRegenerateBtn")?.addEventListener("click", () => {
      void this.generateCurrentImageForStudio();
    });

    modal.querySelector("#icStudioApproveBtn")?.addEventListener("click", () => {
      void this.approveCurrentSceneInStudio();
    });

    modal.querySelector("#icStudioFinishZipBtn")?.addEventListener("click", () => {
      void this.exportZip();
    });

    modal.querySelector("#icStudioFinishExportBtn")?.addEventListener("click", () => {
      this.sendToPodcaster(this.uploadedResults || []);
    });

    modal.querySelector("#icStudioHeaderExportBtn")?.addEventListener("click", () => {
      this.sendToPodcaster(this.uploadedResults || []);
    });

    modal.querySelector("#icStudioCompletionToGalleryBtn")?.addEventListener("click", () => {
      this.switchToGalleryView();
    });

    modal.querySelector("#icStudioToggleViewBtn")?.addEventListener("click", () => {
      if (this.currentViewMode === "gallery") {
        this.switchToInspectorView();
      } else {
        this.switchToGalleryView();
      }
    });

    modal.querySelector("#icStudioBatchGenAllBtn")?.addEventListener("click", () => {
      const missing = this.getMissingSceneIndices();
      void this.runBatchGeneration(missing.length ? missing : null);
    });

    modal.querySelector("#icStudioBatchRegenAllBtn")?.addEventListener("click", () => {
      if (confirm("¿Deseas regenerar todas las escenas desde cero? Se reemplazarán las imágenes actuales.")) {
        void this.runBatchGeneration(this.currentScript?.scenes?.map((_, i) => i) || null);
      }
    });

    modal.querySelector("#icStudioBatchApproveAllBtn")?.addEventListener("click", () => {
      void this.approveAllScenes();
    });

    modal.querySelector("#icStudioPlaceholderBatchBtn")?.addEventListener("click", () => {
      const missing = this.getMissingSceneIndices();
      void this.runBatchGeneration(missing.length ? missing : null);
    });

    modal.querySelector("#icGalleryBackToInspectorBtn")?.addEventListener("click", () => {
      this.switchToInspectorView();
    });

    modal.querySelector("#icGallerySelectAllCheckbox")?.addEventListener("change", (e) => {
      this.toggleSelectAll(e.target.checked);
    });

    modal.querySelector("#icGalleryApproveSelectedBtn")?.addEventListener("click", () => {
      void this.approveSelectedScenes();
    });

    modal.querySelector("#icGalleryRegenSelectedBtn")?.addEventListener("click", () => {
      void this.regenerateSelectedScenes();
    });

    modal.querySelector("#icGalleryFinishBtn")?.addEventListener("click", () => {
      void this.showCompletionInStudio();
    });

    this.bindCharacterEvents(modal);
  }

  extractScenesFromDomTable(blockEl = null) {
    let table = null;
    if (blockEl) {
      table = blockEl.tagName === "TABLE" ? blockEl : blockEl.querySelector("table");
    }
    if (!table) {
      table = document.querySelector(".ic-message--assistant table") || document.querySelector(".ic-table-responsive table") || document.querySelector("#icChatFeed table");
    }
    if (!table) return [];

    const headers = Array.from(table.querySelectorAll("th")).map(th => th.innerText.trim().toLowerCase());
    const findHeader = (regex) => headers.findIndex(h => regex.test(h));

    let timeCol = findHeader(/tiempo|time|duraci/i);
    let guionCol = findHeader(/guion|hook|voz|audio|locuci/i);
    let descCol = findHeader(/descripci|visual|escena|imagen|prompt/i);
    let screenCol = findHeader(/pantalla|overlay|texto/i);
    let transCol = findHeader(/transici/i);
    let elemCol = findHeader(/elemento|acci/i);

    const allRows = Array.from(table.querySelectorAll("tr"));
    const dataRows = allRows.filter(tr => tr.querySelectorAll("td").length > 0);
    if (!dataRows.length) return [];

    if (descCol === -1 && guionCol === -1) {
      const firstRowTds = Array.from(dataRows[0].querySelectorAll("td")).map(td => td.innerText.trim());
      const numCells = firstRowTds.length;
      const startsWithNum = /^\d+$/.test(firstRowTds[0]);
      const offset = startsWithNum ? 1 : 0;
      const hasTime = /\d+:\d+|\d+s|\d+-\d+/i.test(firstRowTds[offset]);

      if (hasTime) {
        timeCol = offset;
        guionCol = offset + 1 < numCells ? offset + 1 : -1;
        descCol = offset + 2 < numCells ? offset + 2 : (guionCol !== -1 ? guionCol : offset);
        screenCol = offset + 3 < numCells ? offset + 3 : -1;
        transCol = offset + 4 < numCells ? offset + 4 : -1;
        elemCol = offset + 5 < numCells ? offset + 5 : -1;
      } else {
        guionCol = offset;
        descCol = offset + 1 < numCells ? offset + 1 : offset;
        screenCol = offset + 2 < numCells ? offset + 2 : -1;
        elemCol = offset + 3 < numCells ? offset + 3 : -1;
      }
    }

    return dataRows.map((tr, idx) => {
      const tds = Array.from(tr.querySelectorAll("td"));
      const getCell = (col) => (col >= 0 && col < tds.length ? tds[col].innerText.trim() : "");

      const tiempo = (timeCol >= 0 ? getCell(timeCol) : "") || "8 segundos";
      const guion = (guionCol >= 0 ? getCell(guionCol) : "") || `Escena ${idx + 1}`;
      const desc = (descCol >= 0 ? getCell(descCol) : "") || (guionCol !== -1 ? getCell(guionCol) : "") || tds.map(td => td.innerText.trim()).join(" ") || `Escena ${idx + 1}`;
      const screen = screenCol >= 0 ? getCell(screenCol) : "";
      const trans = (transCol >= 0 ? getCell(transCol) : "") || "Corte";
      const elem = (elemCol >= 0 ? getCell(elemCol) : "") || desc;

      return {
        tiempo,
        guion,
        descripcion_escena: desc,
        texto_pantalla: screen,
        transicion: trans,
        elemento_visual: elem
      };
    }).filter(s => Boolean(s && (s.descripcion_escena || s.guion)));
  }

  bindGlobalToolbarEvents() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-script-action");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const action = btn.dataset.action;
      const blockEl = btn.closest(".ic-video-script-block") || btn.closest(".ic-message") || btn.closest("article");

      // Buscar escenas: primero en memoria, o directamente de la tabla en el DOM
      let scenes = (this.currentScript?.scenes && this.currentScript.scenes.length)
        ? this.currentScript.scenes
        : (this.lastRenderedScenes && this.lastRenderedScenes.length)
          ? this.lastRenderedScenes
          : this.extractScenesFromDomTable(blockEl);

      if (!scenes || !scenes.length) {
        scenes = this.extractScenesFromDomTable(null);
      }

      if (action === "approve") {
        if (!scenes || !scenes.length) {
          const allTables = document.querySelectorAll("#icChatFeed table");
          for (const tbl of allTables) {
            scenes = this.extractScenesFromDomTable(tbl);
            if (scenes && scenes.length) break;
          }
        }
        if (scenes && scenes.length) {
          this.openSceneStudio(scenes);
        } else {
          alert("No se detectaron escenas en la tabla para aprobar.");
        }
      } else if (action === "copy") {
        const textToCopy = (scenes || []).map((s, idx) =>
          `Escena ${idx + 1} (${s.tiempo || "8s"}):\nGuion: ${s.guion}\nDescripción: ${s.descripcion_escena}\nTexto: ${s.texto_pantalla || "-"}\n`
        ).join("\n");
        navigator.clipboard?.writeText(textToCopy).then(() => {
          btn.style.color = "#22c55e";
          const icon = btn.querySelector("i");
          if (icon) icon.className = "fa-solid fa-check";
          setTimeout(() => {
            btn.style.color = "";
            if (icon) icon.className = "fa-solid fa-copy";
          }, 1500);
        });
      } else if (action === "edit") {
        if (this.elements.promptInput) {
          this.elements.promptInput.focus();
          this.elements.promptInput.scrollIntoView({ behavior: "smooth", block: "center" });
          if (!this.elements.promptInput.value.trim()) {
            this.elements.promptInput.value = "Ajusta la escena: ";
          }
        }
      } else if (action === "reset") {
        this.currentScript = null;
        this.lastRenderedScenes = [];
        if (blockEl) {
          blockEl.style.opacity = "0.4";
          blockEl.style.filter = "grayscale(0.6)";
        }
        if (this.elements.promptInput) {
          this.elements.promptInput.focus();
          this.elements.promptInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });
  }

  async openSceneStudio(scenes = []) {
    this.currentScript = { scenes: [...scenes] };
    this.currentSceneIndex = 0;
    this.sceneImages = [];
    this.selectedSceneIndices = new Set();
    this.currentViewMode = "inspector";
    this.currentGeneratedResult = null;
    this.uploadedResults = [];

    const scriptId = this.state?.activeSessionId || "studio_draft";

    // 1. Cargar todas las imágenes existentes desde IndexedDB (Blobs)
    try {
      const storedBlobs = await getAllSceneBlobsForScript(scriptId);
      if (Array.isArray(storedBlobs) && storedBlobs.length) {
        storedBlobs.forEach((rec) => {
          if (typeof rec.sceneIndex === "number") {
            this.sceneImages[rec.sceneIndex] = rec;
          }
        });
      }
    } catch (e) {
      console.warn("[Lucy Studio] Error leyendo IndexedDB al abrir estudio:", e);
    }

    const modal = document.getElementById("icSceneStudioModal");
    if (!modal) return;
    modal.classList.remove("hidden");

    this.syncCharacterStateFromStorage();

    // 2. Si ya están todas las escenas aprobadas, mostrar directamente la vista de finalización para Podcaster
    const missing = this.getMissingSceneIndices();
    const totalCount = this.currentScript.scenes.length;
    const generatedCount = totalCount - missing.length;
    const allApproved = totalCount > 0 && this.currentScript.scenes.every((_, idx) => this.sceneImages[idx]?.approved === true);

    this.updateBatchButtonsState();

    if (allApproved) {
      await this.showCompletionInStudio();
    } else if (generatedCount > 1) {
      // Si ya hay varias generadas pero no todas aprobadas, mostrar la Galería directamente
      this.switchToGalleryView();
    } else {
      this.switchToInspectorView(0);
    }

    // 3. Revisar si hay un trabajo en segundo plano interrumpido para reanudarlo
    await this.checkAndResumeBackgroundBatch();
  }

  getMissingSceneIndices() {
    if (!this.currentScript?.scenes?.length) return [];
    const missing = [];
    this.currentScript.scenes.forEach((_, idx) => {
      const img = this.sceneImages[idx];
      if (!img?.dataUrl && !img?.downloadUrl && !img?.blob) {
        missing.push(idx);
      }
    });
    return missing;
  }

  updateBatchButtonsState() {
    if (!this.currentScript?.scenes?.length) return;
    const totalCount = this.currentScript.scenes.length;
    const missing = this.getMissingSceneIndices();
    const missingCount = missing.length;
    const generatedCount = totalCount - missingCount;
    const allApproved = totalCount > 0 && this.currentScript.scenes.every((_, idx) => this.sceneImages[idx]?.approved === true);

    const headerExportBtn = document.getElementById("icStudioHeaderExportBtn");
    if (headerExportBtn) {
      if (allApproved) {
        headerExportBtn.classList.remove("hidden");
      } else {
        headerExportBtn.classList.add("hidden");
      }
    }

    const genBtn = document.getElementById("icStudioBatchGenAllBtn");
    const genText = document.getElementById("icStudioBatchGenAllText");
    const regenBtn = document.getElementById("icStudioBatchRegenAllBtn");
    const approveAllBtn = document.getElementById("icStudioBatchApproveAllBtn");
    const placeholderBatchBtn = document.getElementById("icStudioPlaceholderBatchBtn");
    const placeholderBatchText = document.getElementById("icStudioPlaceholderBatchText");

    if (generatedCount === 0) {
      if (genBtn) {
        genBtn.classList.remove("hidden");
        if (genText) genText.textContent = "Generar Todas";
      }
      if (regenBtn) regenBtn.classList.add("hidden");
      if (approveAllBtn) approveAllBtn.classList.add("hidden");
      if (placeholderBatchBtn) placeholderBatchBtn.classList.add("hidden");
    } else if (generatedCount > 0 && generatedCount < totalCount) {
      if (genBtn) {
        genBtn.classList.remove("hidden");
        if (genText) genText.textContent = `Generar las que faltan (${missingCount})`;
      }
      if (regenBtn) regenBtn.classList.remove("hidden");
      if (approveAllBtn) approveAllBtn.classList.add("hidden");
      if (placeholderBatchBtn) {
        placeholderBatchBtn.classList.remove("hidden");
        if (placeholderBatchText) placeholderBatchText.textContent = `Generar las que faltan (${missingCount})`;
      }
    } else {
      // Todas generadas
      if (genBtn) genBtn.classList.add("hidden");
      if (regenBtn) regenBtn.classList.remove("hidden");
      if (approveAllBtn) approveAllBtn.classList.remove("hidden");
      if (placeholderBatchBtn) placeholderBatchBtn.classList.add("hidden");
    }
  }

  async checkAndResumeBackgroundBatch() {
    const scriptId = this.state?.activeSessionId || "studio_draft";
    try {
      const checkpoint = await getScriptCheckpoint(scriptId);
      if (checkpoint && checkpoint.status === "running" && Array.isArray(checkpoint.pendingIndices) && checkpoint.pendingIndices.length > 0) {
        console.log(`[Lucy Studio] Reanudando generación en segundo plano desde checkpoint (${checkpoint.pendingIndices.length} escenas pendientes)...`);
        void this.runBatchGeneration(checkpoint.pendingIndices);
      }
    } catch (e) {
      console.warn("[Lucy Studio] Error verificando checkpoint:", e);
    }
  }

  async approveAllScenes() {
    if (!this.currentScript?.scenes?.length) return;
    const approveBtn = document.getElementById("icStudioBatchApproveAllBtn");
    if (approveBtn) approveBtn.disabled = true;

    try {
      const user = auth.currentUser || this.state?.currentUser || window.currentUser;
      const uid = user?.uid || "";
      const sessionId = this.state?.activeSessionId || "studio_session";

      for (let idx = 0; idx < this.currentScript.scenes.length; idx++) {
        const item = this.sceneImages[idx];
        if (!item) continue;
        if (!item.downloadUrl || item.downloadUrl.startsWith("data:") || item.downloadUrl.startsWith("blob:")) {
          const messageId = `approve_all_scene_${idx + 1}_${Date.now()}`;
          let toUpload = item;
          if (!toUpload.dataUrl && toUpload.blob) {
            toUpload.dataUrl = await blobToDataUrl(toUpload.blob);
          }
          if (uid && toUpload.dataUrl) {
            try {
              const uploaded = await uploadGeneratedResults([toUpload], { uid, sessionId, messageId });
              if (uploaded && uploaded[0]?.downloadUrl) {
                item.downloadUrl = uploaded[0].downloadUrl;
                item.storagePath = uploaded[0].storagePath || "";
              }
            } catch (e) {
              console.warn(`[Lucy Studio] Error subiendo escena ${idx + 1} a Firebase:`, e);
            }
          }
        }
        item.approved = true;
        this.sceneImages[idx] = item;
        await saveSceneBlob(sessionId, idx, item);
      }

      this.saveVideoScriptDataToSession();
      alert("¡Todas las escenas han sido aprobadas y guardadas exitosamente en Firebase!");
      await this.showCompletionInStudio();
    } finally {
      if (approveBtn) approveBtn.disabled = false;
      this.updateBatchButtonsState();
    }
  }

  switchToInspectorView(targetIndex = null) {
    this.currentViewMode = "inspector";
    if (typeof targetIndex === "number" && targetIndex >= 0 && targetIndex < (this.currentScript?.scenes?.length || 0)) {
      this.currentSceneIndex = targetIndex;
    }

    const activeView = document.getElementById("icStudioActiveView");
    const galleryView = document.getElementById("icStudioGalleryView");
    const compView = document.getElementById("icStudioCompletionView");
    const modalFooter = document.getElementById("icStudioModalFooter");
    const toggleBtnText = document.getElementById("icStudioToggleViewText");
    const counterPill = document.getElementById("icStudioCounterPill");

    if (activeView) activeView.classList.remove("hidden");
    if (galleryView) galleryView.classList.add("hidden");
    if (compView) compView.classList.add("hidden");
    if (modalFooter) modalFooter.classList.add("hidden");
    if (toggleBtnText) toggleBtnText.textContent = "Ver Galería";
    if (counterPill) counterPill.style.display = "";

    this.renderCurrentSceneInStudio();
  }

  switchToGalleryView() {
    this.currentViewMode = "gallery";
    const activeView = document.getElementById("icStudioActiveView");
    const galleryView = document.getElementById("icStudioGalleryView");
    const compView = document.getElementById("icStudioCompletionView");
    const modalFooter = document.getElementById("icStudioModalFooter");
    const toggleBtnText = document.getElementById("icStudioToggleViewText");
    const counterPill = document.getElementById("icStudioCounterPill");

    if (activeView) activeView.classList.add("hidden");
    if (galleryView) galleryView.classList.remove("hidden");
    if (compView) compView.classList.add("hidden");
    if (modalFooter) modalFooter.classList.remove("hidden");
    if (toggleBtnText) toggleBtnText.textContent = "Ver Inspector";
    if (counterPill) counterPill.style.display = "none";

    this.renderGalleryGrid();
    this.updateGalleryToolbarState();
  }

  renderGalleryGrid() {
    const grid = document.getElementById("icGalleryGrid");
    if (!grid || !this.currentScript?.scenes?.length) return;

    grid.innerHTML = "";

    this.currentScript.scenes.forEach((scene, index) => {
      const cached = this.sceneImages[index] || this.getCachedSceneImage(index);
      let imgSrc = cached?.objectUrl || cached?.downloadUrl || cached?.dataUrl || "";
      if (!imgSrc && cached?.blob instanceof Blob) {
        imgSrc = URL.createObjectURL(cached.blob);
      }
      const isSelected = this.selectedSceneIndices.has(index);

      const card = document.createElement("div");
      card.className = `ic-gallery-card ${isSelected ? "is-selected" : ""}`;
      card.dataset.sceneIndex = String(index);

      card.innerHTML = `
        <div class="ic-gallery-card-thumb-wrap">
          ${imgSrc ? `
            <img src="${imgSrc}" alt="Escena ${index + 1}" class="ic-gallery-card-thumb" loading="lazy">
          ` : `
            <div class="ic-gallery-card-thumb-empty">
              <i class="fa-solid fa-image"></i>
              <span>Escena ${index + 1}</span>
            </div>
          `}
          <div class="ic-gallery-card-badge">Escena ${index + 1}</div>
          <div class="ic-gallery-card-check">
            <i class="fa-solid fa-check"></i>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.detail === 2) {
          this.switchToInspectorView(index);
          return;
        }
        this.toggleSceneSelection(index);
      });

      grid.appendChild(card);
    });
  }

  toggleSceneSelection(index) {
    if (this.selectedSceneIndices.has(index)) {
      this.selectedSceneIndices.delete(index);
    } else {
      this.selectedSceneIndices.add(index);
    }
    const card = document.querySelector(`.ic-gallery-card[data-scene-index="${index}"]`);
    if (card) {
      card.classList.toggle("is-selected", this.selectedSceneIndices.has(index));
    }
    this.updateGalleryToolbarState();
  }

  toggleSelectAll(selectAll) {
    if (!this.currentScript?.scenes) return;
    if (selectAll) {
      this.currentScript.scenes.forEach((_, idx) => this.selectedSceneIndices.add(idx));
    } else {
      this.selectedSceneIndices.clear();
    }
    document.querySelectorAll(".ic-gallery-card").forEach((card) => {
      const idx = Number(card.dataset.sceneIndex);
      card.classList.toggle("is-selected", this.selectedSceneIndices.has(idx));
    });
    this.updateGalleryToolbarState();
  }

  updateGalleryToolbarState() {
    const count = this.selectedSceneIndices.size;
    const countEl = document.getElementById("icGallerySelectionCount");
    const approveBtn = document.getElementById("icGalleryApproveSelectedBtn");
    const regenBtn = document.getElementById("icGalleryRegenSelectedBtn");
    const selectAllCheckbox = document.getElementById("icGallerySelectAllCheckbox");

    if (countEl) countEl.textContent = `${count} seleccionada${count === 1 ? "" : "s"}`;
    if (approveBtn) approveBtn.disabled = count === 0;
    if (regenBtn) regenBtn.disabled = count === 0;

    const total = this.currentScript?.scenes?.length || 0;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = total > 0 && count === total;
      selectAllCheckbox.indeterminate = count > 0 && count < total;
    }
  }

  async approveSelectedScenes() {
    if (!this.selectedSceneIndices.size) return;
    const indices = Array.from(this.selectedSceneIndices);
    const approveBtn = document.getElementById("icGalleryApproveSelectedBtn");
    const approveText = document.getElementById("icGalleryApproveSelectedText");

    if (approveBtn) approveBtn.disabled = true;
    if (approveText) approveText.textContent = "Guardando en Firebase...";

    try {
      const user = auth.currentUser || this.state?.currentUser || window.currentUser;
      const uid = user?.uid || "";
      const sessionId = this.state?.activeSessionId || "studio_session";

      for (const idx of indices) {
        let cached = this.sceneImages[idx];
        if (!cached?.blob && !cached?.dataUrl && !cached?.downloadUrl) {
          cached = await getSceneBlob(sessionId, idx);
        }
        if (!cached) continue;

        const sceneNum = idx + 1;
        const messageId = `batch_scene_${sceneNum}_${Date.now()}`;

        let toUpload = cached;
        if (!toUpload.dataUrl && toUpload.blob) {
          toUpload.dataUrl = await blobToDataUrl(toUpload.blob);
        }

        try {
          if (uid && toUpload.dataUrl && (!toUpload.downloadUrl || toUpload.downloadUrl.startsWith("data:") || toUpload.downloadUrl.startsWith("blob:"))) {
            const uploaded = await uploadGeneratedResults([toUpload], { uid, sessionId, messageId });
            if (uploaded && uploaded[0]?.downloadUrl) {
              cached.downloadUrl = uploaded[0].downloadUrl;
              cached.storagePath = uploaded[0].storagePath || "";
            }
          }
        } catch (e) {
          console.warn(`[Lucy Studio] Error subiendo escena ${sceneNum} a Firebase:`, e);
        }

        cached.approved = true;
        this.sceneImages[idx] = cached;
        await saveSceneBlob(sessionId, idx, cached);
      }

      this.saveVideoScriptDataToSession();
    } finally {
      if (approveBtn) approveBtn.disabled = false;
      if (approveText) approveText.textContent = "Aprobar Seleccionadas";
      this.selectedSceneIndices.clear();
      this.renderGalleryGrid();
      this.updateGalleryToolbarState();
      this.updateBatchButtonsState();
    }
  }

  async regenerateSelectedScenes() {
    if (!this.selectedSceneIndices.size) return;
    const indices = Array.from(this.selectedSceneIndices);
    await this.runBatchGeneration(indices);
    this.selectedSceneIndices.clear();
    this.renderGalleryGrid();
    this.updateGalleryToolbarState();
  }

  async runBatchGeneration(sceneIndicesToGenerate = null) {
    if (!this.currentScript?.scenes?.length) return;
    const allIndices = sceneIndicesToGenerate || this.currentScript.scenes.map((_, i) => i);
    if (!allIndices.length) return;

    const scriptId = this.state?.activeSessionId || "studio_draft";
    const overlay = document.getElementById("icStudioBatchOverlay");
    const titleEl = document.getElementById("icStudioBatchTitle");
    const fillEl = document.getElementById("icStudioBatchProgressFill");
    const textEl = document.getElementById("icStudioBatchProgressText");

    if (overlay) overlay.classList.remove("hidden");
    if (titleEl) titleEl.textContent = `Generando ${allIndices.length} escenas en segundo plano con Lucy Studio...`;

    let completed = 0;
    const total = allIndices.length;

    const updateProgress = () => {
      const pct = Math.round((completed / total) * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (textEl) textEl.textContent = `${completed} de ${total} completadas (${pct}%)`;
    };
    updateProgress();

    // Guardar checkpoint inicial en IndexedDB
    const completedIndices = [];
    const pendingIndices = [...allIndices];
    await saveScriptCheckpoint(scriptId, {
      status: "running",
      pendingIndices,
      completedIndices,
      totalScenes: this.currentScript.scenes.length
    });

    const CONCURRENCY = 3;
    const queue = [...allIndices];

    const worker = async () => {
      while (queue.length > 0) {
        const sceneIndex = queue.shift();
        const scene = this.currentScript.scenes[sceneIndex];
        if (!scene) continue;

        try {
          const style = document.getElementById("icStudioDataStyle")?.value || "realista";
          const model = this.state?.options?.model || "gemini-2.5-flash-image";

          const useCharacter = Boolean(this.characterConsistent && this.scriptCharacter?.approved && this.scriptCharacter?.dataUrl);
          const activeCharacter = useCharacter ? this.scriptCharacter : null;

          const prompt = this.buildSceneGenerationPrompt({
            visualDescription: scene.descripcion_escena || "",
            elementoVisual: scene.elemento_visual || "",
            textoPantalla: scene.texto_pantalla || "",
            guion: scene.guion || "",
            style,
            character: activeCharacter
          });

          const attachments = [];
          if (useCharacter && this.scriptCharacter?.dataUrl) {
            attachments.push({
              name: "Personaje_Referencia.png",
              mimeType: this.scriptCharacter.mimeType || "image/png",
              dataUrl: this.scriptCharacter.dataUrl,
              base64: this.scriptCharacter.dataUrl.replace(/^data:image\/[a-z]+;base64,/i, "")
            });
          }

          const results = await generateImagesViaGemini({
            mode: "generate",
            prompt,
            options: {
              model,
              count: 1,
              savingsKind: "script",
              scriptSessionId: this.state?.activeSessionId,
              imageSize: this.state?.options?.imageSize || "1K",
              aspectRatio: "16:9"
            },
            attachments
          });

          if (results && results[0]?.dataUrl) {
            // Convertir a Blob binario y guardar en IndexedDB
            const blob = await dataUrlToBlob(results[0].dataUrl);
            const item = {
              ...results[0],
              blob,
              id: `Escena${String(sceneIndex + 1).padStart(2, "0")}`,
              sceneIndex,
              prompt,
              textoPantalla: scene.texto_pantalla || "",
              approved: false
            };

            await saveSceneBlob(scriptId, sceneIndex, item);
            this.sceneImages[sceneIndex] = item;
            if (this.currentSceneIndex === sceneIndex) {
              this.currentGeneratedResult = item;
            }

            // Actualizar checkpoint en IndexedDB
            completedIndices.push(sceneIndex);
            const pIdx = pendingIndices.indexOf(sceneIndex);
            if (pIdx >= 0) pendingIndices.splice(pIdx, 1);
            await saveScriptCheckpoint(scriptId, {
              status: "running",
              pendingIndices,
              completedIndices,
              totalScenes: this.currentScript.scenes.length
            });
          }
        } catch (err) {
          console.warn(`[Lucy Studio] Error en generación de escena ${sceneIndex + 1}:`, err);
        } finally {
          completed++;
          updateProgress();
          this.updateBatchButtonsState();
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
    await Promise.all(workers);

    // Finalizar checkpoint
    await clearScriptCheckpoint(scriptId);

    // Guardar metadatos en la sesión de Firestore
    this.saveVideoScriptDataToSession();

    if (overlay) overlay.classList.add("hidden");
    this.updateBatchButtonsState();

    // Al terminar: mostrar automáticamente la galería de miniaturas medianas
    this.switchToGalleryView();
  }

  renderCurrentSceneInStudio() {
    if (!this.currentScript || !this.currentScript.scenes.length) return;
    const scene = this.currentScript.scenes[this.currentSceneIndex];
    if (!scene) return;

    const sceneNum = this.currentSceneIndex + 1;
    const totalScenes = this.currentScript.scenes.length;

    // Actualizar encabezado
    const curEl = document.getElementById("icStudioCurrentNum");
    const totEl = document.getElementById("icStudioTotalNum");
    if (curEl) curEl.textContent = String(sceneNum);
    if (totEl) totEl.textContent = String(totalScenes);

    // Actualizar datos de escena
    const tiempoEl = document.getElementById("icStudioDataTiempo");
    const guionEl = document.getElementById("icStudioDataGuion");
    const descEl = document.getElementById("icStudioDataDescripcion");
    const textoEl = document.getElementById("icStudioDataTexto");
    const elemEl = document.getElementById("icStudioDataElemento");
    const approveText = document.getElementById("icStudioApproveText");

    if (tiempoEl) tiempoEl.textContent = scene.tiempo || "8 segundos";
    if (guionEl) guionEl.value = scene.guion || "";
    if (descEl) descEl.value = scene.descripcion_escena || "";
    if (textoEl) textoEl.value = scene.texto_pantalla || "";
    if (elemEl) elemEl.value = scene.elemento_visual || "";
    if (approveText) {
      approveText.textContent = sceneNum === totalScenes ? "Aprobar y Finalizar" : `Aprobar Escena ${sceneNum}`;
    }

    // Resetear área izquierda
    const placeholder = document.getElementById("icStudioPlaceholder");
    const loading = document.getElementById("icStudioLoading");
    const resultView = document.getElementById("icStudioResultView");
    const toolbar = document.getElementById("icStudioToolbar");
    const activeView = document.getElementById("icStudioActiveView");
    const compView = document.getElementById("icStudioCompletionView");

    if (activeView) activeView.classList.remove("hidden");
    if (compView) compView.classList.add("hidden");

    // Verificar si ya existe imagen en memoria o en localStorage para esta escena
    const cached = this.sceneImages[this.currentSceneIndex] || this.getCachedSceneImage(this.currentSceneIndex);
    if (cached?.dataUrl) {
      this.currentGeneratedResult = cached;
      const resultImg = document.getElementById("icStudioResultImg");
      if (resultImg) resultImg.src = cached.dataUrl;
      if (placeholder) placeholder.classList.add("hidden");
      if (loading) loading.classList.add("hidden");
      if (resultView) resultView.classList.remove("hidden");
      if (toolbar) toolbar.classList.remove("hidden");
    } else {
      if (placeholder) placeholder.classList.remove("hidden");
      if (loading) loading.classList.add("hidden");
      if (resultView) resultView.classList.add("hidden");
      if (toolbar) toolbar.classList.add("hidden");
      this.currentGeneratedResult = null;
    }
  }

  getCharacterStorageKey() {
    const scriptId = this.state?.activeSessionId || "studio_draft";
    return `lucy_script_char_${scriptId}`;
  }

  syncCharacterStateFromStorage() {
    try {
      const saved = localStorage.getItem(this.getCharacterStorageKey());
      if (saved) {
        this.scriptCharacter = JSON.parse(saved);
        if (this.scriptCharacter?.approved) {
          this.characterConsistent = true;
        }
      }
    } catch (_) {
      this.scriptCharacter = null;
    }
    this.updateCharacterUI();
  }

  updateCharacterUI() {
    const toggle = document.getElementById("icStudioCharacterToggle");
    const status = document.getElementById("icStudioCharacterStatus");
    const box = document.getElementById("icStudioCharacterBox");
    const setup = document.getElementById("icStudioCharacterSetup");
    const preview = document.getElementById("icStudioCharacterPreview");
    const img = document.getElementById("icStudioCharacterImg");
    const nameEl = document.getElementById("icStudioCharacterName");

    if (toggle) toggle.checked = Boolean(this.characterConsistent);

    if (!this.characterConsistent) {
      if (status) {
        status.textContent = "Desactivado";
        status.style.background = "";
        status.style.color = "";
      }
      if (box) box.classList.add("hidden");
      return;
    }

    if (box) box.classList.remove("hidden");

    if (this.scriptCharacter?.approved && this.scriptCharacter?.dataUrl) {
      if (status) {
        status.textContent = "✓ Activo";
        status.style.background = "rgba(34, 197, 94, 0.15)";
        status.style.color = "#22c55e";
      }
      if (setup) setup.classList.add("hidden");
      if (preview) preview.classList.remove("hidden");
      if (img) img.src = this.scriptCharacter.dataUrl;
      if (nameEl) nameEl.textContent = this.scriptCharacter.name || "Personaje Aprobado";
    } else {
      if (status) {
        status.textContent = "Por configurar";
        status.style.background = "rgba(59, 130, 246, 0.15)";
        status.style.color = "#38bdf8";
      }
      if (setup) setup.classList.remove("hidden");
      if (preview) preview.classList.add("hidden");
    }
  }

  bindCharacterEvents(modal) {
    const toggle = modal.querySelector("#icStudioCharacterToggle");
    const genBtn = modal.querySelector("#icStudioGenCharacterBtn");
    const approveBtn = modal.querySelector("#icStudioApproveCharacterBtn");
    const retryBtn = modal.querySelector("#icStudioRetryingCharacterBtn");
    const descInput = modal.querySelector("#icStudioCharacterDesc");

    toggle?.addEventListener("change", () => {
      this.characterConsistent = toggle.checked;
      this.updateCharacterUI();
    });

    genBtn?.addEventListener("click", async () => {
      const desc = descInput?.value.trim();
      if (!desc) {
        alert("Escribe una breve descripción del personaje para generarlo.");
        return;
      }
      const genText = modal.querySelector("#icStudioGenCharacterText");
      if (genBtn) genBtn.disabled = true;
      if (genText) genText.textContent = "Creando personaje...";

      try {
        const style = document.getElementById("icStudioDataStyle")?.value || "realista";
        const model = this.state?.options?.model || "gemini-2.5-flash-image";
        const prompt = `Full-body turnaround character design portrait of: ${desc}. Neutral solid studio background, highly detailed character concept art, vibrant expressive features, consistent clothing style, visual style: ${style}. Clean single character reference sheet.`;

        const results = await generateImagesViaGemini({
          mode: "generate",
          prompt,
          options: {
            model,
            count: 1,
            savingsKind: "script",
            scriptSessionId: this.state?.activeSessionId,
            aspectRatio: "1:1",
            imageSize: "1K"
          },
          attachments: []
        });

        if (!results || !results.length) throw new Error("No se pudo generar el personaje.");

        this.pendingCharacterResult = {
          dataUrl: results[0].dataUrl,
          mimeType: results[0].mimeType || "image/png",
          description: desc,
          name: desc.split(",")[0].trim() || "Personaje de Referencia"
        };

        const img = modal.querySelector("#icStudioCharacterImg");
        const nameEl = modal.querySelector("#icStudioCharacterName");
        const setup = modal.querySelector("#icStudioCharacterSetup");
        const preview = modal.querySelector("#icStudioCharacterPreview");

        if (img) img.src = results[0].dataUrl;
        if (nameEl) nameEl.textContent = this.pendingCharacterResult.name;
        if (setup) setup.classList.add("hidden");
        if (preview) preview.classList.remove("hidden");
      } catch (err) {
        alert(`Error generando personaje: ${err.message || err}`);
      } finally {
        if (genBtn) genBtn.disabled = false;
        if (genText) genText.textContent = "Crear Personaje";
      }
    });

    approveBtn?.addEventListener("click", () => {
      if (!this.pendingCharacterResult) return;
      this.scriptCharacter = {
        ...this.pendingCharacterResult,
        approved: true
      };
      try {
        localStorage.setItem(this.getCharacterStorageKey(), JSON.stringify(this.scriptCharacter));
      } catch (e) {
        console.warn("[Lucy Studio] localStorage error saving character", e);
      }
      this.updateCharacterUI();
    });

    retryBtn?.addEventListener("click", () => {
      this.pendingCharacterResult = null;
      this.scriptCharacter = null;
      try {
        localStorage.removeItem(this.getCharacterStorageKey());
      } catch (_) {}
      const setup = modal.querySelector("#icStudioCharacterSetup");
      const preview = modal.querySelector("#icStudioCharacterPreview");
      if (setup) setup.classList.remove("hidden");
      if (preview) preview.classList.add("hidden");
      this.updateCharacterUI();
    });
  }

  buildSceneGenerationPrompt({
    visualDescription = "",
    elementoVisual = "",
    textoPantalla = "",
    guion = "",
    style = "realista",
    character = null
  }) {
    const STYLE_DESCRIPTIONS = {
      realista: "Hyper-realistic cinematic photograph, shot on 35mm lens, natural lighting, professional cinematography, 8k resolution, masterwork composition, photorealistic textures",
      animacion_3d: "Pixar and Disney style 3D animation render, vibrant stylized colors, clean expressive modeling, studio lighting, subsurface scattering",
      caricatura_moderna: "Modern 2D vector editorial illustration, flat bold shapes, aesthetic clean color palette, crisp line art",
      cinematico: "Epic cinematic movie still, anamorphic widescreen, dramatic cinematic lighting, volumetric atmosphere, shallow depth of field, blockbuster movie aesthetic",
      stick_draw: "Minimalist stick draw comic illustration, crisp outlines, expressive cartoon concept art",
      otro: "Artistic expressive illustration, high visual quality"
    };

    const stylePrompt = STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.realista;

    // DIRECTIVA OFICIAL PARA ENCUADRE ÚNICO (Sin collages, cuadrículas ni divisiones)
    const frameDirective = "A SINGLE continuous, cohesive 16:9 widescreen frame. Important: DO NOT create a collage, NO split-screen grid, NO multi-panel photos, NO borders or triptych.";

    // 1. DESCRIPCIÓN DE PANTALLA: El entorno y mundo visual (PROMPT FUNDAMENTAL)
    const sceneEnvironment = `Primary Scene Setting and World: ${visualDescription}.`;

    // 2. ELEMENTO VISUAL: La acción que se desarrolla en la escena
    const actionPart = elementoVisual ? `Action and Camera Movement: ${elementoVisual}.` : "";

    // 3. PERSONAJE CONSISTENTE (Si está activado y aprobado)
    const characterPart = character?.dataUrl
      ? `STRICT IDENTITY ANCHOR: The primary character in this scene is the character shown in Reference 1 (${character.description || "the approved protagonist"}). Maintain the exact facial features, hair, age, and signature clothing consistent with Reference 1 performing the scene action.`
      : "";

    // 4. TEXTO EN PANTALLA: Integración creativa, sutil y perfectamente coherente (no exagerada)
    let textPart = "";
    if (textoPantalla && textoPantalla !== "(Sin texto en pantalla)") {
      textPart = `CREATIVE AND COHERENT ON-SCREEN TYPOGRAPHY: Artfully and naturally integrate the exact title text: "${textoPantalla}" into the composition. It must be tasteful, refined, and completely coherent with the scene's color palette, lighting, and environmental atmosphere (NOT an exaggerated commercial banner, no garish colors, no cartoonish clutter). It should appear as an elegant, organic element in the environment or a minimalist cinematic documentary lower-third title with sophisticated typography and flawless spelling.`;
    }

    return [
      frameDirective,
      sceneEnvironment,
      actionPart,
      characterPart,
      `Visual Art Style: ${stylePrompt}.`,
      textPart
    ].filter(Boolean).join(" ");
  }

  getStorageCacheKey(index = 0) {
    const scriptId = this.state?.activeSessionId || "studio_draft";
    return `lucy_studio_cache_${scriptId}_scene_${index}`;
  }

  getCachedSceneImage(index = 0) {
    try {
      const raw = localStorage.getItem(this.getStorageCacheKey(index));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  cacheSceneImage(index = 0, result = {}) {
    try {
      if (!result) return;
      // IMPORTANTE: Jamás guardar Data URLs (base64) en localStorage para no agotar la cuota (5MB).
      // IndexedDB (scene-blob-store) ya almacena los Blobs binarios de forma óptima.
      const safeUrl = result.downloadUrl && result.downloadUrl.startsWith("http")
        ? result.downloadUrl
        : "";
      localStorage.setItem(this.getStorageCacheKey(index), JSON.stringify({
        downloadUrl: safeUrl,
        storagePath: result.storagePath || "",
        mimeType: result.mimeType || "image/png",
        id: result.id || `Escena${String(index + 1).padStart(2, "0")}`,
        prompt: result.prompt || "",
        textoPantalla: result.textoPantalla || "",
        approved: result.approved === true,
        sceneIndex: index,
        cachedAt: Date.now()
      }));
    } catch (e) {
      console.warn("[Lucy Studio] Advertencia de cuota en localStorage:", e);
    }
  }

  saveVideoScriptDataToSession() {
    const activeSession = this.state?.activeSession;
    if (!activeSession) return;
    activeSession.videoScriptData = {
      scenes: this.currentScript?.scenes || [],
      sceneImages: this.sceneImages || [],
      scriptCharacter: this.scriptCharacter || null,
      characterConsistent: Boolean(this.characterConsistent)
    };
    if (typeof this.persistActiveSession === "function") {
      this.persistActiveSession().catch((e) => console.warn("[Lucy Studio] Error guardando sesión en Firestore:", e));
    }
  }

  rehydrateFromSession(session) {
    if (!session?.videoScriptData) return;
    const data = session.videoScriptData;
    if (Array.isArray(data.scenes) && data.scenes.length) {
      this.currentScript = { scenes: [...data.scenes] };
    }
    if (Array.isArray(data.sceneImages) && data.sceneImages.length) {
      this.sceneImages = [...data.sceneImages];
      data.sceneImages.forEach((img, idx) => {
        if (img) {
          const imgUrl = img.downloadUrl || img.dataUrl || "";
          this.cacheSceneImage(idx, { ...img, dataUrl: imgUrl });
        }
      });
    }
    if (data.scriptCharacter) {
      this.scriptCharacter = { ...data.scriptCharacter };
      try {
        localStorage.setItem(this.getCharacterStorageKey(), JSON.stringify(this.scriptCharacter));
      } catch (_) {}
    }
    if (typeof data.characterConsistent === "boolean") {
      this.characterConsistent = data.characterConsistent;
    }
    this.updateCharacterUI();
  }

  async generateCurrentImageForStudio() {
    const scene = this.currentScript?.scenes?.[this.currentSceneIndex];
    if (!scene) return;

    const placeholder = document.getElementById("icStudioPlaceholder");
    const loading = document.getElementById("icStudioLoading");
    const resultView = document.getElementById("icStudioResultView");
    const toolbar = document.getElementById("icStudioToolbar");
    const resultImg = document.getElementById("icStudioResultImg");

    // LEER TODOS LOS CAMPOS DEL PANEL DERECHO (ic-studio-right-col)
    const guion = document.getElementById("icStudioDataGuion")?.value.trim() || scene.guion || "";
    const visualDescription = document.getElementById("icStudioDataDescripcion")?.value.trim() || scene.descripcion_escena || "";
    const textoPantalla = document.getElementById("icStudioDataTexto")?.value.trim() || scene.texto_pantalla || "";
    const elementoVisual = document.getElementById("icStudioDataElemento")?.value.trim() || scene.elemento_visual || "";
    const style = document.getElementById("icStudioDataStyle")?.value || "realista";

    // Actualizar la escena con los valores editados
    scene.guion = guion;
    scene.descripcion_escena = visualDescription;
    scene.texto_pantalla = textoPantalla;
    scene.elemento_visual = elementoVisual;

    const useCharacter = Boolean(this.characterConsistent && this.scriptCharacter?.approved && this.scriptCharacter?.dataUrl);
    const activeCharacter = useCharacter ? this.scriptCharacter : null;

    const prompt = this.buildSceneGenerationPrompt({
      visualDescription,
      elementoVisual,
      textoPantalla,
      guion,
      style,
      character: activeCharacter
    });

    const attachments = [];
    if (useCharacter && this.scriptCharacter?.dataUrl) {
      attachments.push({
        name: "Personaje_Referencia.png",
        mimeType: this.scriptCharacter.mimeType || "image/png",
        dataUrl: this.scriptCharacter.dataUrl,
        base64: this.scriptCharacter.dataUrl.replace(/^data:image\/[a-z]+;base64,/i, "")
      });
    }

    if (placeholder) placeholder.classList.add("hidden");
    if (resultView) resultView.classList.add("hidden");
    if (toolbar) toolbar.classList.add("hidden");
    if (loading) loading.classList.remove("hidden");

    const model = this.state?.options?.model || "gemini-2.5-flash-image";

    try {
      const results = await generateImagesViaGemini({
        mode: "generate",
        prompt,
        options: {
          model,
          count: 1,
          savingsKind: "script",
          scriptSessionId: this.state?.activeSessionId,
          imageSize: this.state?.options?.imageSize || "1K",
          aspectRatio: "16:9"
        },
        attachments
      });

      if (!results || !results.length) {
        throw new Error("No se obtuvo ninguna imagen.");
      }

      // Convertir a Blob binario y guardar en IndexedDB (cero problemas de cuota)
      const blob = await dataUrlToBlob(results[0].dataUrl);
      this.currentGeneratedResult = {
        ...results[0],
        blob,
        sceneIndex: this.currentSceneIndex,
        prompt,
        textoPantalla,
        approved: false
      };

      const scriptId = this.state?.activeSessionId || "studio_draft";
      await saveSceneBlob(scriptId, this.currentSceneIndex, this.currentGeneratedResult);
      this.sceneImages[this.currentSceneIndex] = this.currentGeneratedResult;
      this.updateBatchButtonsState();
      this.saveVideoScriptDataToSession();
      console.log(`[Lucy Studio] Imagen de escena ${this.currentSceneIndex + 1} guardada como Blob en IndexedDB.`);

      if (loading) loading.classList.add("hidden");
      if (resultImg) resultImg.src = results[0].dataUrl;
      if (resultView) resultView.classList.remove("hidden");
      if (toolbar) toolbar.classList.remove("hidden");
    } catch (err) {
      if (loading) loading.classList.add("hidden");
      if (placeholder) placeholder.classList.remove("hidden");
      alert(`Error al generar imagen de la escena: ${err.message || err}`);
    }
  }

  async approveCurrentSceneInStudio() {
    if (!this.currentGeneratedResult) {
      alert("Primero debes crear una imagen para esta escena.");
      return;
    }

    const sceneNum = this.currentSceneIndex + 1;
    const approveBtn = document.getElementById("icStudioApproveBtn");
    const approveText = document.getElementById("icStudioApproveText");
    const originalText = approveText?.textContent || `Aprobar Escena ${sceneNum}`;

    if (approveBtn) {
      approveBtn.disabled = true;
      if (approveText) approveText.textContent = "Guardando en Firebase Storage...";
    }

    let finalResult = {
      ...this.currentGeneratedResult,
      id: `Escena${String(sceneNum).padStart(2, "0")}`,
      sceneIndex: this.currentSceneIndex,
      approved: true
    };

    const scriptId = this.state?.activeSessionId || "studio_draft";

    // Subir a Firebase Storage al aprobar
    if (!finalResult.downloadUrl || finalResult.downloadUrl.startsWith("data:") || finalResult.downloadUrl.startsWith("blob:")) {
      try {
        const user = auth.currentUser || this.state?.currentUser || window.currentUser;
        const uid = user?.uid || "";
        const messageId = `scene_${sceneNum}_${Date.now()}`;

        let toUpload = finalResult;
        if (!toUpload.dataUrl && toUpload.blob) {
          toUpload.dataUrl = await blobToDataUrl(toUpload.blob);
        }

        if (uid && toUpload.dataUrl) {
          const uploaded = await uploadGeneratedResults([toUpload], {
            uid,
            sessionId: scriptId,
            messageId
          });

          if (uploaded && uploaded[0]?.downloadUrl) {
            finalResult.downloadUrl = uploaded[0].downloadUrl;
            finalResult.storagePath = uploaded[0].storagePath || "";
            console.log(`[Lucy Studio] Escena ${sceneNum} guardada en Firebase Storage:`, finalResult.downloadUrl);
          }
        }
      } catch (storageErr) {
        console.warn("[Lucy Studio] Advertencia al subir a Firebase Storage:", storageErr);
      }
    }

    if (approveBtn) {
      approveBtn.disabled = false;
      if (approveText) approveText.textContent = originalText;
    }

    // Actualizar en el arreglo de imágenes aprobadas
    this.sceneImages[this.currentSceneIndex] = finalResult;

    // Actualizar en IndexedDB y persistir en la sesión de Firestore
    await saveSceneBlob(scriptId, this.currentSceneIndex, finalResult);
    this.updateBatchButtonsState();
    this.saveVideoScriptDataToSession();

    if (this.currentSceneIndex + 1 < this.currentScript.scenes.length) {
      this.currentSceneIndex++;
      this.renderCurrentSceneInStudio();
    } else {
      await this.showCompletionInStudio();
    }
  }

  async showCompletionInStudio() {
    this.currentViewMode = "completion";
    const activeView = document.getElementById("icStudioActiveView");
    const galleryView = document.getElementById("icStudioGalleryView");
    const compView = document.getElementById("icStudioCompletionView");
    const modalFooter = document.getElementById("icStudioModalFooter");
    const summary = document.getElementById("icStudioCompletionSummary");
    const toggleBtnText = document.getElementById("icStudioToggleViewText");
    const counterPill = document.getElementById("icStudioCounterPill");
    const headerExportBtn = document.getElementById("icStudioHeaderExportBtn");

    if (activeView) activeView.classList.add("hidden");
    if (galleryView) galleryView.classList.add("hidden");
    if (compView) compView.classList.remove("hidden");
    if (modalFooter) modalFooter.classList.add("hidden");
    if (toggleBtnText) toggleBtnText.textContent = "Ver Galería";
    if (counterPill) counterPill.style.display = "none";
    if (headerExportBtn) headerExportBtn.classList.remove("hidden");

    const total = this.currentScript?.scenes?.length || this.sceneImages.length;
    if (summary) {
      summary.textContent = `Se generaron y aprobaron ${total} imágenes de referencia listas para Podcaster.`;
    }

    // Subir imágenes automáticamente a Firebase Storage en segundo plano
    try {
      const user = auth.currentUser || this.state?.currentUser || window.currentUser;
      const uid = user?.uid || "";
      const sessionId = this.state?.activeSessionId || "studio_session";
      const toUploadList = [];
      const indexMap = [];

      for (let i = 0; i < this.sceneImages.length; i++) {
        const img = this.sceneImages[i];
        if (img && (!img.downloadUrl || !img.downloadUrl.startsWith("https://firebasestorage.googleapis.com"))) {
          toUploadList.push(img);
          indexMap.push(i);
        }
      }

      if (uid && toUploadList.length > 0) {
        const uploaded = await uploadGeneratedResults(toUploadList, {
          uid,
          sessionId,
          messageId: `script_${Date.now()}`
        });

        if (Array.isArray(uploaded)) {
          uploaded.forEach((res, k) => {
            const origIdx = indexMap[k];
            if (res?.downloadUrl && this.sceneImages[origIdx]) {
              this.sceneImages[origIdx].downloadUrl = res.downloadUrl;
              this.sceneImages[origIdx].storagePath = res.storagePath || "";
              void saveSceneBlob(sessionId, origIdx, this.sceneImages[origIdx]);
            }
          });
          this.uploadedResults = [...this.sceneImages];
          this.saveVideoScriptDataToSession();
        }
      } else {
        this.uploadedResults = [...this.sceneImages];
      }
    } catch (e) {
      console.warn("[video-script-workflow] Error subiendo a storage en segundo plano:", e);
      this.uploadedResults = [...this.sceneImages];
    }
  }

  async sendAgentMessage(userText) {
    const systemInstruction = `Actúa como un experto guionista audiovisual y creador de contenido para Podcaster.
Tu objetivo es estructurar un guion de video educativo dividido en escenas.
Requerimientos estrictos:
1. Cada escena dura 8 segundos ("8 segundos").
2. El guion de cada escena (voz en off) debe comenzar preferentemente con una pregunta detonante o frase hook atractiva y tener como máximo 17 palabras para caber en 8 segundos.
3. Devuelve obligatoriamente un bloque JSON dentro de un bloque \`\`\`json con la siguiente estructura:
{
  "scenes": [
    {
      "tiempo": "8 segundos",
      "guion": "Frase detonante o voz en off",
      "descripcion_escena": "Descripción visual detallada de lo que se ve en la escena",
      "texto_pantalla": "Texto o títulos de apoyo en pantalla",
      "transicion": "Corte",
      "elemento_visual": "Acción principal en la escena"
    }
  ]
}
No agregues explicaciones fuera del bloque JSON.`;

    const fullPrompt = `${systemInstruction}\n\nInstrucción o tema del usuario:\n${userText}`;

    const response = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: "gemini-2.5-flash",
        payload: {
          contents: [{ parts: [{ text: fullPrompt }] }]
        }
      }
    });

    const reply = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return reply;
  }

  detectScenesFromTable(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) return null;
    const headerRow = matrix[0].map(c => String(c || "").trim().toLowerCase());
    const findCol = (regex) => headerRow.findIndex(h => regex.test(h));

    const timeIdx = findCol(/tiempo|time|duraci/i);
    const guionIdx = findCol(/guion|hook|voz|audio|locuci/i);
    const descIdx = findCol(/descripci|visual|escena|imagen|prompt/i);
    const screenIdx = findCol(/pantalla|overlay|texto/i);
    const transIdx = findCol(/transici/i);
    const elemIdx = findCol(/elemento|acci/i);

    if (descIdx === -1 && guionIdx === -1 && headerRow.length < 2) return null;

    const effectiveDescIdx = descIdx !== -1 ? descIdx : (headerRow.length > 1 ? 1 : 0);
    const effectiveGuionIdx = guionIdx !== -1 ? guionIdx : 0;

    const dataRows = matrix.slice(1);
    const scenes = dataRows.map((row, idx) => {
      const getVal = (col) => (col >= 0 && row[col] != null ? String(row[col]).trim() : "");
      const desc = getVal(effectiveDescIdx) || getVal(effectiveGuionIdx) || row.join(" ");
      const guion = getVal(effectiveGuionIdx) || `Escena ${idx + 1}`;
      const tiempo = getVal(timeIdx) || "8 segundos";
      const texto = getVal(screenIdx);
      const trans = getVal(transIdx) || "Corte";
      const elem = getVal(elemIdx) || desc;

      return {
        tiempo,
        guion,
        descripcion_escena: desc,
        texto_pantalla: texto,
        transicion: trans,
        elemento_visual: elem
      };
    }).filter(s => Boolean(s.descripcion_escena || s.guion));

    return scenes.length > 0 ? scenes : null;
  }

  parseScriptFromReply(replyText) {
    try {
      const jsonMatch = replyText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed.scenes)) return parsed.scenes;
      }
    } catch (_) {}
    return null;
  }

  renderScriptTable(scenes) {
    this.lastRenderedScenes = [...scenes];
    let rowsHtml = scenes.map((s, index) => `
      <tr style="border-bottom: 1px solid var(--ic-border, rgba(255,255,255,0.1));">
        <td style="padding: 8px; font-weight: bold; text-align: center;">${index + 1}</td>
        <td style="padding: 8px;">${s.tiempo || "8s"}</td>
        <td style="padding: 8px;">${s.guion || ""}</td>
        <td style="padding: 8px;">${s.descripcion_escena || ""}</td>
        <td style="padding: 8px;">${s.texto_pantalla || ""}</td>
        <td style="padding: 8px;">${s.transicion || "Corte"}</td>
        <td style="padding: 8px;">${s.elemento_visual || ""}</td>
      </tr>
    `).join("");

    return `
      <div class="ic-table-responsive" style="overflow-x: auto; margin: 10px 0;">
        <table class="ic-markdown-table">
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Tiempo</th>
              <th>Guion (Voz en off)</th>
              <th>Descripción Escena</th>
              <th>Texto Pantalla</th>
              <th>Transición</th>
              <th>Elemento Visual</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      
      <div class="ic-video-script-footer">
        <div class="ic-video-script-toolbar" role="toolbar" aria-label="Acciones de guion">
          <button type="button" class="btn-script-action" data-action="copy" title="Copiar guion al portapapeles" aria-label="Copiar guion">
            <i class="fa-solid fa-copy"></i>
          </button>
          <span class="ic-script-divider" aria-hidden="true"></span>
          <button type="button" class="btn-script-action" data-action="edit" title="Seguir editando en el composer" aria-label="Seguir editando">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <span class="ic-script-divider" aria-hidden="true"></span>
          <button type="button" class="btn-script-action btn-script-action--danger" data-action="reset" title="Descartar y reiniciar" aria-label="Descartar guion">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <span class="ic-script-divider" aria-hidden="true"></span>
          <button type="button" class="btn-script-action btn-script-action--approve" data-action="approve" title="Aprobar guion y generar imágenes" aria-label="Aprobar guion">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    `;
  }

  attachToolbarEvents(container, scenes) {
    // La delegación global en bindGlobalToolbarEvents maneja esto 100% de forma resiliente
    if (Array.isArray(scenes) && scenes.length) {
      this.lastRenderedScenes = [...scenes];
    }
  }

  async exportZip() {
    if (typeof JSZip === "undefined") {
      const script = document.createElement("script");
      script.src = "vendor/jszip/jszip.min.js";
      document.head.appendChild(script);
      await new Promise(r => script.onload = r);
    }

    const zip = new JSZip();
    this.sceneImages.forEach((img, idx) => {
      const base64Data = img.dataUrl.split(",")[1];
      const filename = `Escena${String(idx + 1).padStart(2, "0")}.png`;
      zip.file(filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `Guion_Imagenes_Referencia_${Date.now()}.zip`;
    link.click();
  }

  async sendToPodcaster() {
    await this.openPodcasterExportModal();
  }

  async openPodcasterExportModal() {
    this.cleanupLegacyLocalStorageBloat();

    const user = auth.currentUser || this.state?.currentUser || window.currentUser;
    const uid = user?.uid || "";
    const totalScenes = this.currentScript?.scenes?.length || this.sceneImages.length || 0;

    // 1. Mostrar inmediatamente el modal con estado de carga para agilidad instantánea
    let exportModal = document.getElementById("icPodcasterExportModal");
    if (!exportModal) {
      exportModal = document.createElement("div");
      exportModal.id = "icPodcasterExportModal";
      exportModal.className = "ic-modal-backdrop hidden";
      document.body.appendChild(exportModal);
    }

    exportModal.innerHTML = `
      <div class="ic-podcaster-export-card">
        <header class="ic-studio-header">
          <div class="ic-studio-header-title">
            <i class="fa-solid fa-clapperboard"></i>
            <span>Exportar Escenas a Podcaster &amp; Snoopy</span>
          </div>
          <button type="button" class="ic-studio-close-btn" id="icPodcasterExportCloseBtn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div class="ic-podcaster-export-body" id="icPodcasterExportBody">
          <div class="ic-podcaster-loading-state" style="padding: 36px 16px; text-align: center; color: var(--ic-muted);">
            <div class="ic-studio-loader-brand" style="margin-bottom: 12px;">
              <div class="ic-studio-loader-ring" style="width: 32px; height: 32px; border-width: 3px;" aria-hidden="true"></div>
            </div>
            <p style="font-size: 14px; font-weight: 600; color: var(--ic-text); margin: 0;">Consultando sesiones de Podcaster...</p>
            <p style="font-size: 12px; margin: 6px 0 0 0;">Identificando tu sesión abierta y proyectos recientes.</p>
          </div>
        </div>
      </div>
    `;

    exportModal.classList.remove("hidden");

    exportModal.querySelector("#icPodcasterExportCloseBtn")?.addEventListener("click", () => {
      exportModal.classList.add("hidden");
    });

    // 2. Obtener sesiones recientes de Firestore y LocalStorage
    let recentSessions = [];
    const activeSessionKey = localStorage.getItem("cb_podcaster_active_session_id_v1")
      || localStorage.getItem(`cb_podcaster_active_session_id_v2_${uid}`)
      || localStorage.getItem("cb_podcaster_active_session_id")
      || "";

    if (uid) {
      try {
        const q = query(
          collection(db, "podcaster_sessions"),
          where("ownerId", "==", uid),
          orderBy("updatedAt", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        recentSessions = snap.docs.map((d) => ({ id: d.id, ...d.data(), cloudAvailable: true }));
      } catch (err) {
        console.warn("[Lucy Studio] Error consultando podcaster_sessions en Firestore:", err);
      }
    }

    // Complementar con sesiones locales de Podcaster en localStorage si no estaban en Firestore
    try {
      const localRaw = localStorage.getItem(`cb_podcaster_sessions_v2:${uid}`);
      if (localRaw) {
        const localList = JSON.parse(localRaw);
        if (Array.isArray(localList)) {
          localList.forEach((ls) => {
            if (ls?.id && !recentSessions.some((s) => s.id === ls.id)) {
              recentSessions.push({ ...ls, cloudAvailable: false });
            }
          });
        }
      }
    } catch (_) {}

    // 3. Identificar si ya hay una sesión abierta en Podcaster
    let activeSession = recentSessions.find((s) => s.id === activeSessionKey) || null;

    if ((!activeSession || !activeSession.cloudAvailable) && activeSessionKey && uid) {
      try {
        const docSnap = await getDoc(doc(db, "podcaster_sessions", activeSessionKey));
        if (docSnap.exists()) {
          activeSession = { id: docSnap.id, ...docSnap.data(), cloudAvailable: true };
        }
      } catch (_) {}
    }

    const otherSessions = recentSessions.filter((s) => s.id !== activeSession?.id);

    // 4. Renderizar la propuesta y lista de sesiones
    const bodyEl = exportModal.querySelector("#icPodcasterExportBody");
    if (!bodyEl) return;

    const sessionSummary = (session) => {
      const rowsCount = getPodcasterSessionRows(session).length;
      const plan = planPodcasterReferenceTransfer(totalScenes, session);
      if (!session.cloudAvailable) return `${rowsCount} escenas · Guarda esta sesión en Podcaster antes de transferir.`;
      if (!plan.ok) return `${rowsCount} escenas · ${plan.error}`;
      return plan.offset === 1
        ? `${rowsCount} escenas · Intro y outro detectadas. Lucy 1 → Podcaster 2; Lucy ${totalScenes} → Podcaster ${totalScenes + 1}.`
        : `${rowsCount} escenas · Correspondencia directa: Lucy 1 → Podcaster 1.`;
    };
    bodyEl.innerHTML = `
      <div style="font-size: 12.5px; color: var(--ic-muted); line-height: 1.45; background: var(--ic-panel); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--ic-border);">
        <i class="fa-solid fa-film" style="color: var(--ic-accent); margin-right: 6px;"></i>
        Tienes <strong>${totalScenes} escenas</strong> con imágenes de referencia listas para transferir a Podcaster.
      </div>

      ${activeSession ? `
        <div class="ic-podcaster-active-card">
          <div class="ic-podcaster-active-header">
            <i class="fa-solid fa-bolt" style="color: #f59e0b;"></i>
            <span>Sesión abierta detectada en Podcaster</span>
          </div>
          <h4 class="ic-podcaster-active-title">${escapeHtml(activeSession.title || activeSession.script?.episodeTitle || "Sesión de Podcaster")}</h4>
          <div class="ic-podcaster-active-meta">
            ${escapeHtml(sessionSummary(activeSession))}
          </div>
          <button type="button" class="ic-studio-btn ic-studio-btn-primary" id="icExportToActiveBtn" style="margin-top: 6px; width: 100%; justify-content: center;" ${!activeSession.cloudAvailable || !planPodcasterReferenceTransfer(totalScenes, activeSession).ok ? "disabled" : ""}>
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Cargar imágenes a esta sesión abierta</span>
          </button>
        </div>
      ` : ""}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <span style="font-size: 13px; font-weight: 700; color: var(--ic-text);">
          ${activeSession ? "O elige otra sesión reciente:" : "Tus sesiones recientes de Podcaster:"}
        </span>
        <span style="font-size: 11.5px; color: var(--ic-muted);">${otherSessions.length} encontradas</span>
      </div>

      <div class="ic-podcaster-session-list">
        ${otherSessions.map((s) => {
          const displayTitle = escapeHtml(s.title || s.script?.episodeTitle || "Sesión sin título");
          let dateStr = "";
          try {
            const ts = s.updatedAt?.toMillis ? s.updatedAt.toMillis() : (s.updatedAt || s.createdAt);
            if (ts) dateStr = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          } catch (_) {}

          return `
            <div class="ic-podcaster-session-item" data-session-id="${escapeHtml(s.id)}">
              <div class="ic-podcaster-item-info">
                <span class="ic-podcaster-item-title">${displayTitle}</span>
                <span class="ic-podcaster-item-meta">${escapeHtml(sessionSummary(s))}${dateStr ? ` · ${dateStr}` : ""}</span>
              </div>
              <button type="button" class="ic-studio-btn-sm ic-studio-btn-secondary" data-action="load-to-session" data-session-id="${escapeHtml(s.id)}" ${!s.cloudAvailable || !planPodcasterReferenceTransfer(totalScenes, s).ok ? "disabled" : ""}>
                <i class="fa-solid fa-arrow-right"></i>
                <span>Cargar aquí</span>
              </button>
            </div>
          `;
        }).join("")}

        ${!otherSessions.length && !activeSession ? `
          <div style="font-size: 12.5px; color: var(--ic-muted); padding: 18px 0; text-align: center;">
            No se encontraron sesiones previas en Podcaster. Puedes crear una nueva para comenzar.
          </div>
        ` : ""}
      </div>

      <div style="margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--ic-border); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <span style="font-size: 12px; color: var(--ic-muted);">¿Quieres crear un proyecto nuevo?</span>
        <button type="button" class="ic-studio-btn ic-studio-btn-accent" id="icExportCreateNewSessionBtn">
          <i class="fa-solid fa-plus"></i>
          <span>Crear Nueva Sesión en Podcaster</span>
        </button>
      </div>
    `;

    // 5. Vincular acciones
    bodyEl.querySelector("#icExportToActiveBtn")?.addEventListener("click", () => {
      if (activeSession) {
        void this.executePodcasterExport(activeSession.id, false, exportModal);
      }
    });

    bodyEl.querySelectorAll("[data-action='load-to-session']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-session-id");
        if (targetId) {
          void this.executePodcasterExport(targetId, false, exportModal);
        }
      });
    });

    bodyEl.querySelector("#icExportCreateNewSessionBtn")?.addEventListener("click", () => {
      void this.executePodcasterExport(null, true, exportModal);
    });
  }

  async executePodcasterExport(targetSessionId = null, createNew = false, exportModal = null) {
    const user = auth.currentUser || this.state?.currentUser || window.currentUser;
    const uid = user?.uid || "";
    if (!uid) {
      alert("Debes iniciar sesión para transferir las escenas a Podcaster.");
      return;
    }

    const modal = exportModal || document.getElementById("icPodcasterExportModal");
    const bodyEl = modal?.querySelector("#icPodcasterExportBody");
    try {
      const totalScenes = this.currentScript?.scenes?.length || 0;
      if (!totalScenes) throw new Error("Lucy Studio no tiene escenas para transferir.");
      for (let index = 0; index < totalScenes; index += 1) {
        if (this.sceneImages[index]?.approved !== true) {
          throw new Error(`La imagen de la escena ${index + 1} aún no está aprobada.`);
        }
      }
      const sourceSessionId = this.state?.activeSessionId || "studio_session";
      let initialPlan = null;
      if (!createNew) {
        if (!targetSessionId) throw new Error("Elige una sesión de Podcaster.");
        const snap = await getDoc(doc(db, "podcaster_sessions", targetSessionId));
        if (!snap.exists()) throw new Error("La sesión elegida no está guardada en Podcaster.");
        if (String(snap.data()?.ownerId || "").trim() !== uid) throw new Error("No tienes permiso para modificar esta sesión.");
        initialPlan = planPodcasterReferenceTransfer(totalScenes, snap.data());
        if (!initialPlan.ok) throw new Error(initialPlan.error);
      }

      if (bodyEl) bodyEl.innerHTML = `
        <div class="ic-podcaster-loading-state">
          <div class="ic-studio-loader-brand"><div class="ic-studio-loader-ring" aria-hidden="true"></div></div>
          <h4 id="icExportSyncTitle">Preparando referencias para Snoopy...</h4>
          <p id="icExportSyncSubtitle">${initialPlan?.offset === 1 ? "Intro y outro detectadas: las referencias empiezan en la escena 2." : "Comprobando las imágenes aprobadas."}</p>
          <div class="ic-studio-progress-track"><div class="ic-studio-progress-fill" id="icExportSyncFill"></div></div>
          <span id="icExportSyncText">0 / ${totalScenes} escenas</span>
        </div>`;
      const fillEl = modal?.querySelector("#icExportSyncFill");
      const textEl = modal?.querySelector("#icExportSyncText");
      const subEl = modal?.querySelector("#icExportSyncSubtitle");

      for (let idx = 0; idx < totalScenes; idx += 1) {
        const item = this.sceneImages[idx];
        if (!/^https:\/\//i.test(String(item.downloadUrl || "")) || !String(item.storagePath || "").trim()) {
          if (subEl) subEl.textContent = `Subiendo imagen ${idx + 1} de ${totalScenes} a Storage...`;
          const toUpload = { ...item, downloadUrl: "", storagePath: "" };
          if (!toUpload.blob && toUpload.dataUrl) toUpload.blob = await dataUrlToBlob(toUpload.dataUrl);
          const uploaded = await uploadGeneratedResults([toUpload], {
            uid,
            sessionId: sourceSessionId,
            messageId: `export_${idx + 1}_${Date.now()}`
          });
          if (!/^https:\/\//i.test(String(uploaded?.[0]?.downloadUrl || "")) || !String(uploaded?.[0]?.storagePath || "").trim()) {
            throw new Error(`No se pudo subir la imagen de la escena ${idx + 1}.`);
          }
          item.downloadUrl = uploaded[0].downloadUrl;
          item.storagePath = uploaded[0].storagePath;
          await saveSceneBlob(sourceSessionId, idx, item);
        }
        if (fillEl) fillEl.style.width = `${Math.round(((idx + 1) / totalScenes) * 100)}%`;
        if (textEl) textEl.textContent = `${idx + 1} / ${totalScenes} escenas`;
      }
      validateApprovedSceneImages(this.sceneImages, totalScenes);
      if (subEl) subEl.textContent = "Guardando referencias en Podcaster...";

      let finalSessionId = targetSessionId;
      let savedMaps = null;
      let savedAt = new Date().toISOString();
      if (createNew) {
        const title = this.state?.activeSession?.title || "Video de Lucy Studio";
        const session = buildNewPodcasterVideoSession({
          scenes: this.currentScript.scenes,
          images: this.sceneImages,
          title,
          now: savedAt
        });
        savedMaps = {
          rowReferenceImageMap: session.rowReferenceImageMap,
          rowReferenceImageListMap: session.rowReferenceImageListMap,
          rowReferenceVideoMap: session.rowReferenceVideoMap,
          rowReferenceModeByRowId: session.rowReferenceModeByRowId
        };
        const docRef = doc(collection(db, "podcaster_sessions"));
        session.id = docRef.id;
        await setDoc(docRef, {
          ownerId: uid,
          title: session.title,
          archived: false,
          session,
          sessionUpdatedAt: savedAt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        finalSessionId = docRef.id;
      } else {
        const sessionRef = doc(db, "podcaster_sessions", finalSessionId);
        savedMaps = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(sessionRef);
          if (!snap.exists()) throw new Error("La sesión de Podcaster ya no existe.");
          const data = snap.data();
          if (String(data.ownerId || "").trim() !== uid) throw new Error("No tienes permiso para modificar esta sesión.");
          const currentPlan = planPodcasterReferenceTransfer(totalScenes, data);
          if (!currentPlan.ok || currentPlan.rowIds.join("|") !== initialPlan.rowIds.join("|")) {
            throw new Error("Las escenas de Podcaster cambiaron durante la transferencia. Vuelve a elegir la sesión.");
          }
          const hasNestedSession = data.session && typeof data.session === "object";
          const sourceSession = hasNestedSession
            ? data.session
            : { id: finalSessionId, title: data.title || "Sesión de Podcaster", script: data.script || { rows: getPodcasterSessionRows(data) } };
          const maps = buildPodcasterReferenceMaps({ ...data, ...sourceSession }, currentPlan.assignments, this.sceneImages);
          savedAt = new Date().toISOString();
          const sessionPatch = hasNestedSession
            ? Object.fromEntries(Object.entries(maps).map(([key, value]) => [`session.${key}`, value]))
            : { session: { ...sourceSession, ...maps, updatedAt: savedAt } };
          transaction.update(sessionRef, {
            ...sessionPatch,
            ...(hasNestedSession ? { "session.updatedAt": savedAt } : {}),
            sessionUpdatedAt: savedAt,
            updatedAt: serverTimestamp()
          });
          return maps;
        });
      }

      try {
        const cacheKey = `cb_podcaster_sessions_v2:${uid}`;
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
        if (Array.isArray(cached)) {
          const local = cached.find((entry) => String(entry?.id || "") === finalSessionId);
          if (local) {
            Object.assign(local, savedMaps, { updatedAt: savedAt });
            localStorage.setItem(cacheKey, JSON.stringify(cached));
          }
        }
      } catch (cacheError) {
        console.warn("[Lucy Studio] No se pudo actualizar la caché local de Podcaster:", cacheError);
      }

      try {
        localStorage.setItem("cb_podcaster_active_session_id_v1", finalSessionId);
        localStorage.setItem(`cb_podcaster_active_session_id_v2_${uid}`, finalSessionId);
      } catch (storageErr) {
        console.warn("[Lucy Studio] Advertencia guardando activeSessionId en localStorage:", storageErr);
      }

      const lightPayload = {
        source: "lucyStudio",
        sessionId: finalSessionId,
        savedAt: Date.now(),
        referenceImages: this.sceneImages.slice(0, totalScenes).map((img) => img.downloadUrl)
      };
      try {
        localStorage.setItem(PODCASTER_VIDEO_IMPORT_STORAGE_KEY, JSON.stringify(lightPayload));
      } catch (bridgeErr) {
        console.warn("[Lucy Studio] Advertencia guardando payload puente:", bridgeErr);
      }

      if (subEl) subEl.textContent = "¡Completado! Abriendo Podcaster...";

      setTimeout(() => {
        window.location.href = `podcaster.html?sessionId=${encodeURIComponent(finalSessionId)}`;
      }, 350);
    } catch (err) {
      console.warn("[Lucy Studio] No se completó la transferencia a Podcaster:", err);
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #ef4444;">
            <p>No se transfirieron las referencias: ${escapeHtml(err.message || String(err))}</p>
            <button type="button" class="ic-studio-btn ic-studio-btn-secondary" onclick="document.getElementById('icPodcasterExportModal')?.classList.add('hidden')">
              Cerrar
            </button>
          </div>
        `;
      } else alert(`No se transfirieron las referencias: ${err.message || err}`);
    }
  }

  async loadImagesIntoPodcasterSession(targetSessionId = null, createNew = false) {
    return this.executePodcasterExport(targetSessionId, createNew);
  }
}
