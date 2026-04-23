import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js?v=2026-1.0.1.14";
// Firebase imports
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    query,
    collection,
    where,
    getDocs,
    deleteDoc,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

import {
    getAuth,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';


import { 
    generarContenidoGemini, 
    geminiGenerateRequest,
    generarModuloGemini,
    getGeminiEndpoint,
    reformularParrafoConIA,
} from './moodlecourse-geminiOperations.js?v=2026-1.0.1.14';

import { 
    activarEdicionModuloCompleto,
    desactivarEdicionModuloCompleto,
    guardarContenidoModulo,
} from './moodleClurse-extraFunctions.js?v=2026-1.0.1.14';
import { sanitizeHtml, sanitizeRichText, sanitizeTextInput } from './security-utils.js?v=2026-1.0.1.14';
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js?v=2026-1.0.1.14";
import { authFetchJson, buildApiUrl } from "./api-client.js?v=2026-1.0.1.14";
import {
    applySimplePreviewStateFromLayers,
    cleanupModuleGraphicInlinePreview,
    getSimplePreviewState,
    loadSelectedPreviewTextIntoEditor,
    mergeSimplePreviewIntoLayers,
    renderModuleGraphicInlinePreview,
    renderSimplePreviewBackground,
    renderSimplePreviewFooter,
    renderSimplePreviewText,
    upsertSelectedPreviewText
} from "./moodleCourse-graphicPreview.js?v=2026-1.0.1.14";


/* CONFIGURACIÓN FIREBASE */
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
void bootstrapFirebaseAppCheck(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);


export let currentUserId = null;

const listaCursos = document.getElementById("listaCursos");
let cursosUsuario = [];
/* ============================================================
   CONFIGURACIÓN GEMINI
============================================================ */



/* VARIABLES GLOBALES */
let cursoDocId = null;
let curso = null;
let temaActivo = null;
let subtemaActivo = null;


let moduloEditandoCompleto = null;
let moduloEditandoInstruccionesId = null;
let cursosOtrosUsuarios = [];
let currentUserRole = null;
const moduloAutosaveTimers = new Map();
let mostrarModulosArchivados = localStorage.getItem("cb_mostrar_modulos_archivados") === "1";

let textoOriginalParaReformular = "";
let seleccionOriginalParaReformular = null;
const USE_SORTABLE_SIDEBAR = typeof window !== 'undefined' && !!window.Sortable;
let sortableTemasInstance = null;
let sortableSubtemasInstances = [];
const modulosCache = new Map();
let geminiModelsSyncPromise = null;

function resolveMoodleCollabPermissions(data = {}, uid = "") {
    const safeUid = String(uid || "").trim();
    const details = Array.isArray(data?.compartidoConDetalles) ? data.compartidoConDetalles : [];
    const detail = details.find((item) => String(item?.userId || "").trim() === safeUid);
    const raw = detail?.permisos || detail || {};
    return {
        editar: raw?.editar === true,
        compartir: raw?.compartir === true,
        eliminar: false
    };
}

function isMoodleCourseSharedWithUser(data = {}, uid = "") {
    const safeUid = String(uid || "").trim();
    if (!safeUid) return false;
    const sharedIds = Array.isArray(data?.compartidoCon) ? data.compartidoCon : [];
    if (sharedIds.includes(safeUid)) return true;
    const details = Array.isArray(data?.compartidoConDetalles) ? data.compartidoConDetalles : [];
    return details.some((item) => String(item?.userId || "").trim() === safeUid);
}

function normalizeGeminiModelName(model = "") {
    return String(model || "")
        .trim()
        .replace(/^models\//i, "")
        .replace(/:generateContent$/i, "");
}

function isMoodleSupportedGeminiTextModelName(model = "") {
    const name = normalizeGeminiModelName(model);
    if (!name) return false;
    if (!/^gemini-(2\.5|3(?:\.1)?)/i.test(name)) return false;
    if (/(image|audio|tts|live|embedding|embed|vision|aqa|transcribe|computer|computer-use|cu-)/i.test(name)) return false;
    if (/(?:^|[-])(exp|experimental)(?:[-]|$)/i.test(name)) return false;
    return true;
}

function isTextGeminiGenerationModel(modelInfo = {}) {
    const name = normalizeGeminiModelName(modelInfo?.name || "");
    if (!name) return false;
    if (!isMoodleSupportedGeminiTextModelName(name)) return false;

    const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
        ? modelInfo.supportedGenerationMethods.map((method) => String(method || "").trim())
        : [];

    return methods.length === 0 || methods.includes("generateContent");
}

function formatGeminiModelOptionLabel(model = "") {
    const normalized = normalizeGeminiModelName(model);
    const directMap = {
        "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
        "gemini-2.5-flash": "Gemini 2.5 Flash",
        "gemini-2.5-pro": "Gemini 2.5 Pro",
        "gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
        "gemini-3-pro-preview": "Gemini 3 Pro (Preview)",
        "gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
        "gemini-3.1-flash-preview": "Gemini 3.1 Flash (Preview)",
        "gemini-3.1-flash-lite-preview": "Gemini 3.1 Flash Lite (Preview)"
    };
    if (directMap[normalized]) return directMap[normalized];

    return normalized
        .replace(/^gemini-/i, "Gemini ")
        .replace(/-/g, " ")
        .replace(/\bpreview\b/gi, "(Preview)")
        .replace(/\bflash lite\b/gi, "Flash Lite")
        .replace(/\bflash\b/gi, "Flash")
        .replace(/\bpro\b/gi, "Pro")
        .replace(/\s+/g, " ")
        .trim();
}

async function syncGeminiModelOptionsForMoodle() {
    const select = document.getElementById("selectGeminiEndpoint");
    if (!select || geminiModelsSyncPromise) return geminiModelsSyncPromise;

    const currentValue = normalizeGeminiModelName(select.value || "gemini-2.5-flash-lite") || "gemini-2.5-flash-lite";
    const fallbackModels = Array.from(select.options || [])
        .map((opt) => normalizeGeminiModelName(opt.value || ""))
        .filter(isMoodleSupportedGeminiTextModelName);

    geminiModelsSyncPromise = (async () => {
        try {
            const data = await authFetchJson("/api/gemini/models", { method: "GET" });
            const backendModels = Array.isArray(data?.models) ? data.models : [];
            const filteredBackendModels = backendModels
                .filter(isTextGeminiGenerationModel)
                .map((modelInfo) => normalizeGeminiModelName(modelInfo?.name || ""))
                .filter(isMoodleSupportedGeminiTextModelName);

            const mergedModels = Array.from(new Set([
                ...filteredBackendModels,
                ...fallbackModels
            ]));

            mergedModels.sort((a, b) => {
                const aPreview = /\bpreview\b/i.test(a);
                const bPreview = /\bpreview\b/i.test(b);
                if (aPreview !== bPreview) return aPreview ? 1 : -1;
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
            });

            select.innerHTML = "";
            mergedModels.forEach((modelName) => {
                const option = document.createElement("option");
                option.value = modelName;
                option.textContent = formatGeminiModelOptionLabel(modelName);
                if (modelName === "gemini-2.5-flash-lite") {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            const preferredValue = mergedModels.includes(currentValue)
                ? currentValue
                : (mergedModels.includes("gemini-2.5-flash-lite") ? "gemini-2.5-flash-lite" : (mergedModels[0] || currentValue));

            if (preferredValue) {
                select.value = preferredValue;
            }
        } catch (_) {
            // Mantener catálogo hardcodeado actual si el backend no responde.
        } finally {
            geminiModelsSyncPromise = null;
        }
    })();

    return geminiModelsSyncPromise;
}
const TOUR_MODULOS_STORAGE_KEY = "cb_tour_acciones_modulo_v1";
let tourAccionesModuloActivo = false;
let tourAccionesModuloPaso = 0;
let tourAccionesModuloTarget = null;
let tourAccionesModuloMostradoEnSesion = false;
const escapeHtml = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const MODULE_GRAPHIC_LIGHTBOX_ID = "cbModuleGraphicLightbox";
let moduleGraphicLightboxLastFocus = null;

function ensureModuleGraphicLightbox() {
    let modal = document.getElementById(MODULE_GRAPHIC_LIGHTBOX_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODULE_GRAPHIC_LIGHTBOX_ID;
    modal.className = "cb-module-graphic-lightbox hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
    modal.dataset.mode = "preview";
    modal.dataset.section = "composition";
    modal.dataset.zoom = "1";
    modal.innerHTML = `
        <div class="cb-module-graphic-lightbox__backdrop" data-mc-action="cerrar-galeria-grafico-modulo"></div>
        <div class="cb-module-graphic-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Vista previa del gráfico del módulo">
            <header class="cb-module-graphic-lightbox__header">
                <div class="cb-module-graphic-lightbox__header-copy">
                    <div class="cb-module-graphic-lightbox__header-title-row">
                        <div class="cb-module-graphic-lightbox__header-title">Vista previa del gráfico</div>
                        <div class="cb-module-graphic-lightbox__caption"></div>
                    </div>
                </div>
                <div class="cb-module-graphic-lightbox__header-actions">
                    <button type="button" class="cb-module-graphic-lightbox__close" data-mc-action="cerrar-galeria-grafico-modulo" aria-label="Cerrar vista previa del gráfico">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </header>
            <div class="cb-module-graphic-lightbox__body">
                <section class="cb-module-graphic-lightbox__stage-wrap">
                    <div class="cb-module-graphic-lightbox__stage-scroll">
                        <div class="cb-module-graphic-lightbox__stage">
                            <div class="cb-module-graphic-lightbox__background-layer"></div>
                            <div class="cb-module-graphic-lightbox__simple-preview-background-layer"></div>
                            <img class="cb-module-graphic-lightbox__image" src="" alt="">
                            <div class="cb-module-graphic-lightbox__graphic-layer"></div>
                            <div class="cb-module-graphic-lightbox__custom-layer"></div>
                            <div class="cb-module-graphic-lightbox__text-layer"></div>
                            <div class="cb-module-graphic-lightbox__simple-preview-text-layer"></div>
                        </div>
                    </div>
                </section>
            </div>
            <footer class="cb-module-graphic-lightbox__footer"></footer>
        </div>
    `;
    const applyPreviewInputValue = (previewInput) => {
        if (!previewInput) return false;
        const state = getSimplePreviewState(modal);
        const key = String(previewInput.getAttribute("data-preview-input") || "").trim();
        if (!key) return false;
        if (key === "backgroundOpacity") state.backgroundOpacity = Math.max(0.06, Math.min(0.42, Number(previewInput.value || 18) / 100));
        if (key === "text") {
            state.text = String(previewInput.value || "");
            if (state.text.trim()) state.textPanelOpen = true;
        }
        if (key === "fontFamily") state.fontFamily = String(previewInput.value || "Arial, sans-serif");
        if (key === "fontSize") state.fontSize = Math.max(14, Math.min(64, Number(previewInput.value || 28)));
        if (key === "fontWeight") state.fontWeight = String(previewInput.value || "700");
        if (key === "color") state.color = String(previewInput.value || "#1f2937");
        if (key === "backgroundColor") state.backgroundColor = `${String(previewInput.value || "#ffffff").trim()}CC`;
        renderSimplePreviewBackground(modal);
        renderSimplePreviewText(modal);
        return true;
    };
    modal.addEventListener("input", (event) => {
        const previewInput = event.target.closest("[data-preview-input]");
        if (!previewInput) return;
        applyPreviewInputValue(previewInput);
    });
    modal.addEventListener("change", (event) => {
        const previewInput = event.target.closest("[data-preview-input]");
        if (previewInput) {
            applyPreviewInputValue(previewInput);
            return;
        }
        const input = event.target.closest("[data-layer-toggle]");
        if (!input) return;
        const stage = modal.querySelector(".cb-module-graphic-lightbox__stage");
        if (!stage) return;
        const layer = String(input.getAttribute("data-layer-toggle") || "").trim();
        const shouldShow = !!input.checked;
        stage.classList.toggle(`is-hidden-${layer}`, !shouldShow);
    });
    modal.addEventListener("click", async (event) => {
        const dragSuppressUntil = Number(modal.dataset.suppressDragClickUntil || "0");
        if (dragSuppressUntil > Date.now() && event.target.closest(".cb-module-graphic-lightbox__draggable")) {
            event.preventDefault();
            return;
        }
        const colorChip = event.target.closest(".cb-module-graphic-lightbox__color-chip");
        if (colorChip && !(event.target instanceof HTMLInputElement && event.target.type === "color")) {
            const colorInput = colorChip.querySelector('input[type="color"]');
            if (colorInput instanceof HTMLInputElement) {
                event.preventDefault();
                event.stopPropagation();
                if (typeof colorInput.showPicker === "function") {
                    colorInput.showPicker();
                } else {
                    colorInput.click();
                }
                return;
            }
        }
        const graphicElementNode = event.target.closest(".cb-module-graphic-lightbox__graphic-element");
        const previewTextNode = event.target.closest(".cb-module-graphic-lightbox__preview-text-box");
        if (previewTextNode) {
            const textId = String(previewTextNode.getAttribute("data-text-id") || "").trim();
            if (textId) {
                const state = getSimplePreviewState(modal);
                loadSelectedPreviewTextIntoEditor(modal, textId);
                state.textPanelOpen = true;
                state.backgroundPanelOpen = false;
                renderSimplePreviewText(modal);
                renderSimplePreviewFooter(modal);
            }
        }
        if (graphicElementNode) {
            const elementId = String(graphicElementNode.dataset.elementId || "").trim();
            const elementKind = String(graphicElementNode.dataset.elementKind || "graphic").trim() || "graphic";
            if (elementId) {
                selectGraphicElement(modal, elementId, elementKind);
                const state = getGraphicSelectionState(modal);
                if (state.wandArmed && event.target instanceof HTMLImageElement) {
                    const layers = normalizeEditableGraphicLayers(modal.__graphicLayers || {});
                    const elementModel = findGraphicSelectionTarget(layers, state);
                    if (elementModel?.imageUrl) {
                        const rect = event.target.getBoundingClientRect();
                        const relX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                        const relY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
                        const naturalWidth = event.target.naturalWidth || rect.width || 1;
                        const naturalHeight = event.target.naturalHeight || rect.height || 1;
                        const clickX = (relX / Math.max(1, rect.width)) * naturalWidth;
                        const clickY = (relY / Math.max(1, rect.height)) * naturalHeight;
                        try {
                            const maskResult = await createMagicMaskFromImageUrl(
                                String(elementModel.imageUrl || "").trim(),
                                clickX,
                                clickY,
                                Number(elementModel.maskTolerance || state.tolerance || 26),
                                elementModel.maskInvert === true || state.invert === true
                            );
                            elementModel.maskedImageUrl = maskResult.maskedImageUrl;
                            elementModel.maskSelection = maskResult.selection;
                            elementModel.maskTolerance = maskResult.selection.tolerance;
                            elementModel.maskInvert = maskResult.selection.invert;
                            state.wandArmed = false;
                            modal.__graphicLayers = layers;
                            renderEditableGraphicLayers(modal, layers);
                        } catch (error) {
                            reportEstadoGeneracionModulo(
                                String(modal?.__graphicContext?.moduleId || "").trim(),
                                String(error?.message || "No se pudo aplicar la varita mágica."),
                                "warning",
                                false
                            );
                        }
                    }
                }
            }
        }
        const action = event.target.closest("[data-layer-command]");
        if (!action) return;
        const command = String(action.getAttribute("data-layer-command") || "").trim();
        const layerId = String(action.getAttribute("data-layer-id") || "").trim();
        const layers = normalizeEditableGraphicLayers(modal.__graphicLayers || {});
        if (command === "set-mode") {
            setGraphicLightboxMode(modal, String(action.getAttribute("data-layer-mode") || "preview").trim() || "preview");
            return;
        }
        if (command === "set-section") {
            setGraphicLightboxSection(modal, String(action.getAttribute("data-layer-section") || "composition").trim() || "composition");
            return;
        }
        if (command === "zoom-in") {
            setGraphicLightboxZoom(modal, Number(modal.dataset.zoom || "1") + 0.1);
            return;
        }
        if (command === "zoom-out") {
            setGraphicLightboxZoom(modal, Number(modal.dataset.zoom || "1") - 0.1);
            return;
        }
        if (command === "zoom-reset") {
            setGraphicLightboxZoom(modal, 1);
            return;
        }
        if (command === "preview-bg-preset") {
            const state = getSimplePreviewState(modal);
            state.backgroundPreset = String(action.getAttribute("data-preview-preset") || "none").trim() || "none";
            renderSimplePreviewBackground(modal);
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-bg-panel") {
            const state = getSimplePreviewState(modal);
            state.backgroundPanelOpen = !state.backgroundPanelOpen;
            if (state.backgroundPanelOpen) state.textPanelOpen = false;
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-panel") {
            const state = getSimplePreviewState(modal);
            state.textPanelOpen = !state.textPanelOpen;
            if (state.textPanelOpen) state.backgroundPanelOpen = false;
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-toggle") {
            const state = getSimplePreviewState(modal);
            if (state.selectedTextId) {
                state.texts = state.texts.filter((item) => String(item?.id || "").trim() !== String(state.selectedTextId || "").trim());
                state.selectedTextId = "";
            }
            renderSimplePreviewText(modal);
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-new") {
            const state = getSimplePreviewState(modal);
            state.selectedTextId = "";
            state.text = "";
            state.textPosition = { x: 6, y: 68 };
            state.fontFamily = "Arial, sans-serif";
            state.fontSize = 28;
            state.fontWeight = "700";
            state.fontStyle = "normal";
            state.color = "#1f2937";
            state.backgroundColor = "transparent";
            state.textPanelOpen = true;
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-italic") {
            const state = getSimplePreviewState(modal);
            state.fontStyle = state.fontStyle === "italic" ? "normal" : "italic";
            renderSimplePreviewText(modal);
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-bg-none") {
            const state = getSimplePreviewState(modal);
            state.backgroundColor = state.backgroundColor === "transparent" ? "#ffffffcc" : "transparent";
            renderSimplePreviewText(modal);
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-color-none") {
            const state = getSimplePreviewState(modal);
            state.color = state.color === "transparent" ? "#1f2937" : "transparent";
            renderSimplePreviewText(modal);
            renderSimplePreviewFooter(modal);
            return;
        }
        if (command === "preview-text-apply") {
            const applied = upsertSelectedPreviewText(modal);
            renderSimplePreviewText(modal);
            renderSimplePreviewFooter(modal);
            if (!applied) {
                reportEstadoGeneracionModulo(String(modal?.__graphicContext?.moduleId || "").trim(), "Escribe un texto antes de aplicar.", "warning", false);
            }
            return;
        }
        if (command === "preview-save") {
            const previewState = getSimplePreviewState(modal);
            if (String(previewState.text || "").trim()) {
                upsertSelectedPreviewText(modal);
            }
            const mergedLayers = mergeSimplePreviewIntoLayers(modal, modal.__graphicLayers || {});
            modal.__graphicLayers = mergedLayers;
            persistRegeneratedModuleGraphic({ modal, image: null, layers: mergedLayers }).then(() => {
                reportEstadoGeneracionModulo(String(modal?.__graphicContext?.moduleId || "").trim(), "Background y textos guardados.", "success", false);
            }).catch((error) => {
                reportEstadoGeneracionModulo(String(modal?.__graphicContext?.moduleId || "").trim(), String(error?.message || "No se pudo guardar la edición."), "warning", false);
            });
            return;
        }
        if (command === "arm-wand") {
            const state = getGraphicSelectionState(modal);
            state.wandArmed = !state.wandArmed;
            renderGraphicSelectionPanel(modal, layers);
            return;
        }
        if (command === "toggle-mask-invert") {
            const state = getGraphicSelectionState(modal);
            state.invert = !state.invert;
            const selected = findGraphicSelectionTarget(layers, state);
            if (selected) {
                selected.maskInvert = state.invert;
            }
            modal.__graphicLayers = layers;
            renderEditableGraphicLayers(modal, layers);
            return;
        }
        if (command === "clear-mask") {
            const state = getGraphicSelectionState(modal);
            const selected = findGraphicSelectionTarget(layers, state);
            if (selected) {
                selected.maskedImageUrl = "";
                selected.maskSelection = null;
                selected.maskInvert = false;
            }
            state.invert = false;
            modal.__graphicLayers = layers;
            renderEditableGraphicLayers(modal, layers);
            return;
        }
        if (command === "download-svg") {
            descargarGraficoModuloComoSvg(modal).catch((error) => {
                reportEstadoGeneracionModulo(
                    String(modal?.__graphicContext?.moduleId || "").trim(),
                    String(error?.message || "No se pudo descargar el SVG."),
                    "warning",
                    false
                );
            });
            return;
        }
        if (command === "generate-composition") {
            const original = action.innerHTML;
            action.disabled = true;
            action.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generando...</span>';
            try {
                await generarComposicionGraficaPorCapas(modal);
            } finally {
                action.disabled = false;
                action.innerHTML = original;
            }
            return;
        }
        if (command === "mask-tolerance") {
            const state = getGraphicSelectionState(modal);
            const nextTolerance = Number(event.target?.value || 26);
            state.tolerance = nextTolerance;
            const selected = findGraphicSelectionTarget(layers, state);
            if (selected) {
                selected.maskTolerance = nextTolerance;
            }
            modal.__graphicLayers = layers;
            renderGraphicSelectionPanel(modal, layers);
            return;
        }
        if (command === "add") {
            layers.extraLayers.push({
                id: `custom-${Date.now()}`,
                label: `Capa extra ${layers.extraLayers.length + 1}`,
                prompt: "Elemento adicional",
                imageUrl: "",
                maskedImageUrl: "",
                storagePath: "",
                mimeType: "image/png",
                model: "",
                manualPosition: null,
                placed: false,
                maskSelection: null,
                maskTolerance: 26,
                maskInvert: false,
                validation: null,
                kind: "custom"
            });
            modal.__graphicLayers = layers;
            renderEditableGraphicLayers(modal, layers);
            return;
        }
        const textarea = layerId ? modal.querySelector(`textarea[data-layer-editor="${layerId}"]`) : null;
        if (command === "edit" && textarea) {
            const enabled = !textarea.disabled;
            textarea.disabled = enabled;
            textarea.focus();
            textarea.select();
            action.innerHTML = enabled ? '<i class="fas fa-pen"></i><span>Editar prompt</span>' : '<i class="fas fa-check"></i><span>Guardar</span>';
            return;
        }
        if (!layerId) return;
        if (command === "delete") {
            eliminarLayerEditable(layers, layerId);
            modal.__graphicLayers = layers;
            renderEditableGraphicLayers(modal, layers);
            return;
        }
        if ((command === "regenerate" || command === "edit") && textarea) {
            actualizarLayerDesdePrompt(layers, layerId, textarea.value);
            modal.__graphicLayers = layers;
            if (command === "regenerate" && (layerId === "graphic" || layerId === "text")) {
                const original = action.innerHTML;
                action.disabled = true;
                action.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Regenerando...</span>';
                try {
                    if (layerId === "graphic") {
                        await generarComposicionGraficaPorCapas(modal);
                    } else if (layerId === "text") {
                        layers.textLayer = {
                            ...layers.textLayer,
                            ...await regenerateTextLayerMetadata(modal, textarea.value)
                        };
                        modal.__graphicLayers = layers;
                        await persistRegeneratedModuleGraphic({ modal, image: null, layers });
                    }
                } finally {
                    action.disabled = false;
                    action.innerHTML = original;
                }
            }
            if (command === "regenerate" && layerId !== "graphic" && layerId !== "text" && layerId !== "background") {
                const extraLayer = (Array.isArray(layers.extraLayers) ? layers.extraLayers : []).find((item) => String(item?.id || "").trim() === layerId);
                if (extraLayer) {
                    const original = action.innerHTML;
                    action.disabled = true;
                    action.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generando capa...</span>';
                    try {
                        await generarCapaExtraGrafica(modal, extraLayer);
                    } finally {
                        action.disabled = false;
                        action.innerHTML = original;
                    }
                }
            }
            renderEditableGraphicLayers(modal, layers);
        }
    });
    document.body.appendChild(modal);
    return modal;
}

function decodeGraphicLayers(serialized = "") {
    const raw = String(serialized || "").trim();
    if (!raw) return null;
    try {
        return JSON.parse(decodeURIComponent(raw));
    } catch (_) {
        return null;
    }
}

function normalizeEditableGraphicLayers(layers = {}) {
    const normalized = layers && typeof layers === "object" ? JSON.parse(JSON.stringify(layers)) : {};
    if (!Array.isArray(normalized.extraLayers)) normalized.extraLayers = [];
    if (!normalized.background || typeof normalized.background !== "object") normalized.background = {};
    if (!normalized.graphic || typeof normalized.graphic !== "object") normalized.graphic = {};
    if (!normalized.textLayer || typeof normalized.textLayer !== "object") normalized.textLayer = {};
    if (!Array.isArray(normalized.graphic.anchors)) normalized.graphic.anchors = [];
    if (!Array.isArray(normalized.graphic.elements)) normalized.graphic.elements = [];
    if (Array.isArray(normalized.graphic.items) && !normalized.graphic.anchors.length) {
        normalized.graphic.anchors = normalized.graphic.items.map((item, index) => ({
            id: String(item?.id || `anchor-${index + 1}`),
            label: String(item?.label || "").trim(),
            shape: String(item?.shape || "marker").trim() || "marker",
            position: String(item?.position || "").trim()
        })).filter((item) => item.label);
    }
    if (!Array.isArray(normalized.graphic.focus)) normalized.graphic.focus = [];
    normalized.graphic.elements = normalized.graphic.elements.map((item, index) => ({
        id: String(item?.id || `element-${index + 1}`),
        anchorId: String(item?.anchorId || "").trim(),
        label: String(item?.label || "").trim(),
        prompt: String(item?.prompt || "").trim(),
        imageUrl: String(item?.imageUrl || "").trim(),
        maskedImageUrl: String(item?.maskedImageUrl || "").trim(),
        storagePath: String(item?.storagePath || "").trim(),
        mimeType: String(item?.mimeType || "image/png").trim() || "image/png",
        model: String(item?.model || "").trim(),
        manualPosition: item?.manualPosition && typeof item.manualPosition === "object" ? item.manualPosition : null,
        placed: item?.placed === true,
        maskSelection: item?.maskSelection && typeof item.maskSelection === "object" ? item.maskSelection : null,
        maskTolerance: Number.isFinite(Number(item?.maskTolerance)) ? Number(item.maskTolerance) : 26,
        maskInvert: item?.maskInvert === true,
        validation: item?.validation && typeof item.validation === "object" ? item.validation : null
    }));
    normalized.extraLayers = normalized.extraLayers.map((item, index) => ({
        id: String(item?.id || `custom-${index + 1}`),
        label: String(item?.label || `Capa extra ${index + 1}`).trim(),
        prompt: String(item?.prompt || "").trim(),
        imageUrl: String(item?.imageUrl || "").trim(),
        maskedImageUrl: String(item?.maskedImageUrl || "").trim(),
        storagePath: String(item?.storagePath || "").trim(),
        mimeType: String(item?.mimeType || "image/png").trim() || "image/png",
        model: String(item?.model || "").trim(),
        manualPosition: item?.manualPosition && typeof item.manualPosition === "object" ? item.manualPosition : null,
        placed: item?.placed === true,
        maskSelection: item?.maskSelection && typeof item.maskSelection === "object" ? item.maskSelection : null,
        maskTolerance: Number.isFinite(Number(item?.maskTolerance)) ? Number(item.maskTolerance) : 26,
        maskInvert: item?.maskInvert === true,
        validation: item?.validation && typeof item.validation === "object" ? item.validation : null,
        kind: "custom"
    }));
    if (!Array.isArray(normalized.textLayer.labels)) {
        const callouts = Array.isArray(normalized.textLayer.callouts) ? normalized.textLayer.callouts : [];
        normalized.textLayer.labels = callouts.map((item, index) => ({
            id: `label-${index + 1}`,
            text: String(item?.text || item || "").trim(),
            anchorId: String(normalized.graphic.anchors[index]?.id || `anchor-${index + 1}`),
            position: String(item?.position || "").trim()
        })).filter((item) => item.text);
    }
    if (!Array.isArray(normalized.textLayer.legend)) {
        normalized.textLayer.legend = Array.isArray(normalized.textLayer.notes) ? normalized.textLayer.notes : [];
    }
    if (!Array.isArray(normalized.textLayer.connectors)) {
        normalized.textLayer.connectors = normalized.textLayer.labels.map((item, index) => ({
            id: `connector-${index + 1}`,
            labelId: String(item?.id || `label-${index + 1}`),
            anchorId: String(item?.anchorId || normalized.graphic.anchors[index]?.id || `anchor-${index + 1}`)
        }));
    }
    if (!normalized.background.color) normalized.background.color = "#FFFFFF";
    if (!normalized.textLayer.titlePosition) normalized.textLayer.titlePosition = "top-left";
    if (!normalized.textLayer.subtitlePosition) normalized.textLayer.subtitlePosition = "top-left";
    if (!normalized.textLayer.legendPosition) normalized.textLayer.legendPosition = "bottom-right";
    return normalized;
}

function getGraphicLightboxMode(modal) {
    return String(modal?.dataset?.mode || "preview").trim() || "preview";
}

function getGraphicLightboxSection(modal) {
    return String(modal?.dataset?.section || "composition").trim() || "composition";
}

function setGraphicLightboxMode(modal, mode = "preview") {
    if (!modal) return;
    const nextMode = mode === "edit" ? "edit" : "preview";
    modal.dataset.mode = nextMode;
    modal.classList.toggle("is-edit-mode", nextMode === "edit");
    modal.classList.toggle("is-preview-mode", nextMode !== "edit");
    modal.querySelectorAll('[data-layer-command="set-mode"]').forEach((button) => {
        const active = String(button.getAttribute("data-layer-mode") || "").trim() === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const statusText = modal.querySelector(".cb-module-graphic-lightbox__stage-status-text");
    if (statusText) {
        statusText.textContent = nextMode === "edit" ? "Modo edición" : "Vista final";
    }
    renderGraphicItemsLayer(modal, normalizeEditableGraphicLayers(modal.__graphicLayers || {}).graphic || {});
    renderCustomGraphicLayers(modal, normalizeEditableGraphicLayers(modal.__graphicLayers || {}));
    renderGraphicTextLayer(modal, normalizeEditableGraphicLayers(modal.__graphicLayers || {}).textLayer || {});
    requestAnimationFrame(() => updateGraphicConnectorLayout(modal));
}

function setGraphicLightboxSection(modal, section = "composition") {
    if (!modal) return;
    const allowed = new Set(["composition", "elements", "text", "export"]);
    const nextSection = allowed.has(section) ? section : "composition";
    modal.dataset.section = nextSection;
    modal.querySelectorAll(".cb-module-graphic-lightbox__section-tab").forEach((button) => {
        const active = String(button.getAttribute("data-layer-section") || "").trim() === nextSection;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
    });
    modal.querySelectorAll("[data-layer-panel]").forEach((panel) => {
        panel.classList.toggle("hidden", String(panel.getAttribute("data-layer-panel") || "").trim() !== nextSection);
    });
}

function setGraphicLightboxZoom(modal, value = 1) {
    if (!modal) return;
    const zoom = Math.min(1.75, Math.max(0.65, Number(value) || 1));
    modal.dataset.zoom = String(zoom);
    modal.querySelector(".cb-module-graphic-lightbox__stage")?.style.setProperty("--cb-stage-zoom", String(zoom));
}

function getGraphicSelectionState(modal) {
    if (!modal.__graphicSelection || typeof modal.__graphicSelection !== "object") {
        modal.__graphicSelection = {
            elementId: "",
            elementKind: "graphic",
            wandArmed: false,
            tolerance: 26,
            invert: false
        };
    }
    return modal.__graphicSelection;
}

function selectGraphicElement(modal, elementId = "", elementKind = "graphic") {
    const state = getGraphicSelectionState(modal);
    state.elementId = String(elementId || "").trim();
    state.elementKind = String(elementKind || "graphic").trim() === "custom" ? "custom" : "graphic";
    const layers = normalizeEditableGraphicLayers(modal.__graphicLayers || {});
    const selected = findGraphicSelectionTarget(layers, state);
    state.tolerance = Math.max(4, Number(selected?.maskTolerance || state.tolerance || 26));
    state.invert = selected?.maskInvert === true;
    modal.querySelectorAll(".cb-module-graphic-lightbox__graphic-element").forEach((node) => {
        const matchesId = String(node.dataset.elementId || "").trim() === state.elementId;
        const matchesKind = String(node.dataset.elementKind || "graphic").trim() === state.elementKind;
        node.classList.toggle("is-selected", matchesId && matchesKind);
    });
    renderGraphicSelectionPanel(modal, layers);
}

function findGraphicSelectionTarget(layers = {}, state = {}) {
    const elementId = String(state?.elementId || "").trim();
    const elementKind = String(state?.elementKind || "graphic").trim() === "custom" ? "custom" : "graphic";
    if (!elementId) return null;
    if (elementKind === "custom") {
        return (Array.isArray(layers?.extraLayers) ? layers.extraLayers : [])
            .find((item) => String(item?.id || "").trim() === elementId) || null;
    }
    return (Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements : [])
        .find((item) => String(item?.id || "").trim() === elementId) || null;
}

function getSafeGuidedElementPosition(anchorPos = { x: 50, y: 50 }, index = 0) {
    const columnOffset = (index % 2 === 0) ? 12 : -12;
    const rowOffset = Math.floor(index / 2) * 10;
    let x = clampPercent(anchorPos.x + columnOffset, 16, 84);
    let y = clampPercent(anchorPos.y + rowOffset, 18, 84);
    if (x < 46 && y < 34) {
        x = clampPercent(x + 24, 16, 84);
        y = clampPercent(y + 12, 18, 84);
    }
    return { x, y };
}

function applyGuidedGraphicLayout(layers = {}) {
    const next = normalizeEditableGraphicLayers(layers);
    const anchors = Array.isArray(next.graphic?.anchors) ? next.graphic.anchors : [];
    const labels = Array.isArray(next.textLayer?.labels) ? next.textLayer.labels : [];

    if (!next.textLayer.titleManualPosition) next.textLayer.titleManualPosition = { x: 8, y: 8 };
    if (!next.textLayer.subtitleManualPosition) next.textLayer.subtitleManualPosition = { x: 8, y: 15 };
    if (!next.textLayer.legendManualPosition) next.textLayer.legendManualPosition = { x: 70, y: 79 };

    labels.forEach((item, index) => {
        if (item?.manualPosition && typeof item.manualPosition === "object") return;
        const linkedAnchorIndex = anchors.findIndex((anchor) => String(anchor?.id || "").trim() === String(item?.anchorId || "").trim());
        const anchorPos = getAnchorStagePosition(
            linkedAnchorIndex >= 0 ? anchors[linkedAnchorIndex] : anchors[index] || {},
            linkedAnchorIndex >= 0 ? linkedAnchorIndex : index,
            anchors.length || labels.length || 1
        );
        const placement = String(item?.placement || item?.position || "").trim().toLowerCase() || inferLabelPlacementFromAnchor(anchorPos);
        item.manualPosition = getLabelPositionFromAnchor(anchorPos, placement);
    });

    return next;
}

function getGraphicCanvasSpec() {
    return {
        width: 1024,
        height: 1024,
        label: "Gemini 2.5 Flash Image · 1:1 · 1024x1024"
    };
}

function getNamedLayerPosition(name = "", index = 0, total = 1) {
    const normalized = String(name || "").trim().toLowerCase();
    const map = {
        "top-left": { x: 12, y: 14 },
        "top-center": { x: 44, y: 14 },
        "top-right": { x: 74, y: 14 },
        "middle-left": { x: 10, y: 42 },
        "center": { x: 42, y: 42 },
        "middle-right": { x: 74, y: 42 },
        "bottom-left": { x: 12, y: 72 },
        "bottom-center": { x: 44, y: 74 },
        "bottom-right": { x: 72, y: 74 }
    };
    if (map[normalized]) return map[normalized];
    const safeTotal = Math.max(1, Number(total) || 1);
    const column = index % 3;
    const row = Math.floor(index / 3) % Math.ceil(safeTotal / 3 || 1);
    return {
        x: 12 + (column * 28),
        y: 16 + (row * 22)
    };
}

function clampPercent(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function getAnchorStagePosition(anchor = {}, index = 0, total = 1) {
    const manual = anchor?.manualPosition && typeof anchor.manualPosition === "object" ? anchor.manualPosition : null;
    if (manual) {
        return {
            x: clampPercent(manual.x, 6, 94),
            y: clampPercent(manual.y, 8, 92)
        };
    }
    const base = getNamedLayerPosition(anchor?.position, index, total);
    return {
        x: clampPercent(base.x, 10, 90),
        y: clampPercent(base.y, 12, 88)
    };
}

function getUnplacedGraphicLayerPosition(index = 0) {
    return {
        x: 87,
        y: clampPercent(16 + (index * 14), 16, 84)
    };
}

function inferLabelPlacementFromAnchor(anchorPos = { x: 50, y: 50 }) {
    const { x, y } = anchorPos;
    if (x < 32 && y < 36) return "right";
    if (x > 68 && y < 36) return "left";
    if (x < 32 && y > 62) return "right";
    if (x > 68 && y > 62) return "left";
    if (y < 26) return "bottom";
    if (y > 74) return "top";
    if (x < 50) return "right";
    return "left";
}

function getLabelOffsetForPlacement(placement = "right") {
    const map = {
        top: { dx: 0, dy: -11 },
        right: { dx: 13, dy: -2 },
        bottom: { dx: 0, dy: 11 },
        left: { dx: -13, dy: -2 }
    };
    return map[String(placement || "right").trim().toLowerCase()] || map.right;
}

function getLabelPositionFromAnchor(anchorPos = { x: 50, y: 50 }, placement = "right") {
    const offset = getLabelOffsetForPlacement(placement);
    return {
        x: clampPercent(anchorPos.x + offset.dx, 8, 92),
        y: clampPercent(anchorPos.y + offset.dy, 8, 92)
    };
}

function sanitizeLayerPositionName(value = "", fallback = "center") {
    const allowed = new Set([
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "center",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right"
    ]);
    const clean = String(value || "").trim().toLowerCase();
    return allowed.has(clean) ? clean : fallback;
}

function setGraphicBackground(modal, background = {}) {
    const layer = modal?.querySelector(".cb-module-graphic-lightbox__background-layer");
    if (!layer) return;
    const color = String(background?.color || "").trim() || "#FFFFFF";
    layer.style.background = color;
}

function renderGraphicConnectorOverlay(target, connectors = []) {
    if (!target) return;
    target.innerHTML = `
        <svg class="cb-module-graphic-lightbox__connector-layer" viewBox="0 0 1024 1024" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <marker id="cbGraphicArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L12,6 L0,12 z" fill="#0f172a"></path>
                </marker>
            </defs>
            ${connectors.map((connector) => `
                <line class="cb-module-graphic-lightbox__connector-line"
                      data-label-id="${escapeHtml(String(connector?.labelId || "").trim())}"
                      data-anchor-id="${escapeHtml(String(connector?.anchorId || "").trim())}"
                      x1="0" y1="0" x2="0" y2="0"></line>
            `).join("")}
        </svg>
    `;
}

function getStagePointFromElement(stage, element) {
    if (!stage || !element) return null;
    const stageRect = stage.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return null;
    return {
        x: (elementRect.left + (elementRect.width / 2)) - stageRect.left,
        y: (elementRect.top + (elementRect.height / 2)) - stageRect.top
    };
}

function updateGraphicConnectorLayout(modal) {
    const stage = modal?.querySelector(".cb-module-graphic-lightbox__stage");
    const svg = modal?.querySelector(".cb-module-graphic-lightbox__connector-layer");
    if (!stage || !svg) return;
    svg.setAttribute("viewBox", `0 0 ${stage.clientWidth || 1024} ${stage.clientHeight || 1024}`);
    svg.querySelectorAll(".cb-module-graphic-lightbox__connector-line").forEach((line) => {
        const labelId = String(line.getAttribute("data-label-id") || "").trim();
        const anchorId = String(line.getAttribute("data-anchor-id") || "").trim();
        const labelNode = modal.querySelector(`.cb-module-graphic-lightbox__label-box[data-label-id="${CSS.escape(labelId)}"]`);
        const anchorNode = modal.querySelector(`.cb-module-graphic-lightbox__graphic-anchor[data-anchor-id="${CSS.escape(anchorId)}"]`);
        const labelPoint = getStagePointFromElement(stage, labelNode);
        const anchorPoint = getStagePointFromElement(stage, anchorNode);
        if (!labelPoint || !anchorPoint) return;
        const placement = String(labelNode?.dataset?.labelPlacement || "").trim().toLowerCase();
        let endX = labelPoint.x;
        let endY = labelPoint.y;
        if (placement === "left") endX += (labelNode.offsetWidth / 2);
        if (placement === "right") endX -= (labelNode.offsetWidth / 2);
        if (placement === "top") endY += (labelNode.offsetHeight / 2);
        if (placement === "bottom") endY -= (labelNode.offsetHeight / 2);
        line.setAttribute("x1", String(endX));
        line.setAttribute("y1", String(endY));
        line.setAttribute("x2", String(anchorPoint.x));
        line.setAttribute("y2", String(anchorPoint.y));
        line.setAttribute("marker-end", "url(#cbGraphicArrow)");
    });
}

function syncDraggedGraphicLayerState(modal, element) {
    const layers = normalizeEditableGraphicLayers(modal?.__graphicLayers || {});
    const left = clampPercent(parseFloat(element?.style?.left || "0"), 0, 100);
    const top = clampPercent(parseFloat(element?.style?.top || "0"), 0, 100);
    const position = { x: left, y: top };
    const kind = String(element?.dataset?.dragKind || "").trim();
    if (kind === "graphic") {
        const role = String(element?.dataset?.graphicRole || "anchor").trim();
        if (role === "element") {
            const elementId = String(element?.dataset?.elementId || "").trim();
            const graphicElement = layers.graphic.elements.find((item) => String(item?.id || "").trim() === elementId);
            if (graphicElement) {
                graphicElement.manualPosition = position;
                graphicElement.placed = true;
            }
        } else {
            const anchorId = String(element?.dataset?.anchorId || "").trim();
            const anchor = layers.graphic.anchors.find((item) => String(item?.id || "").trim() === anchorId);
            if (anchor) anchor.manualPosition = position;
        }
    } else if (kind === "text") {
        const labelId = String(element?.dataset?.labelId || "").trim();
        const role = String(element?.dataset?.textRole || "").trim();
        if (labelId) {
            const label = layers.textLayer.labels.find((item) => String(item?.id || "").trim() === labelId);
            if (label) label.manualPosition = position;
        } else if (role === "title") {
            layers.textLayer.titleManualPosition = position;
        } else if (role === "subtitle") {
            layers.textLayer.subtitleManualPosition = position;
        } else if (role === "legend") {
            layers.textLayer.legendManualPosition = position;
        }
    } else if (kind === "preview-text") {
        const state = getSimplePreviewState(modal);
        const textId = String(element?.dataset?.textId || "").trim();
        const previewText = state.texts.find((item) => String(item?.id || "").trim() === textId);
        if (previewText) {
            previewText.textPosition = position;
            if (String(state.selectedTextId || "").trim() === textId) {
                state.textPosition = position;
            }
        }
    } else if (kind === "custom") {
        const layerId = String(element?.dataset?.layerId || "").trim();
        const extra = layers.extraLayers.find((item) => String(item?.id || "").trim() === layerId);
        if (extra) {
            extra.manualPosition = position;
            extra.placed = true;
        }
    }
    modal.__graphicLayers = layers;
}

function renderGraphicLayerCard(modal, layerKey, lines = []) {
    const card = modal.querySelector(`[data-layer-card="${layerKey}"] .cb-module-graphic-lightbox__layer-body`);
    if (!card) return;
    card.innerHTML = (Array.isArray(lines) ? lines : [])
        .map((line) => String(line || "").trim())
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("") || "<p>Sin datos de esta capa.</p>";
}

function getLayerPromptValue(layers = {}, layerId = "") {
    if (layerId === "background") {
        return [
            layers.background?.description || "",
            layers.background?.color ? `Color: ${layers.background.color}` : "",
            layers.background?.palette ? `Paleta: ${layers.background.palette}` : ""
        ].filter(Boolean).join("\n");
    }
    if (layerId === "graphic") {
        return [
            layers.graphic?.description || "",
            ...(Array.isArray(layers.graphic?.anchors) ? layers.graphic.anchors.map((item) => item?.label || "") : []),
            ...(Array.isArray(layers.graphic?.elements) ? layers.graphic.elements.map((item) => item?.prompt || "") : []),
            ...(Array.isArray(layers.graphic?.focus) ? layers.graphic.focus : [])
        ].filter(Boolean).join("\n");
    }
    if (layerId === "text") {
        return [
            layers.textLayer?.title || "",
            layers.textLayer?.subtitle || "",
            ...(Array.isArray(layers.textLayer?.labels) ? layers.textLayer.labels.map((item) => item?.text || "") : []),
            ...(Array.isArray(layers.textLayer?.legend) ? layers.textLayer.legend : [])
        ].filter(Boolean).join("\n");
    }
    const extra = (Array.isArray(layers.extraLayers) ? layers.extraLayers : []).find((item) => item?.id === layerId);
    return String(extra?.prompt || "").trim();
}

function renderLayerStack(modal, layers = {}) {
    const stack = modal.querySelector(".cb-module-graphic-lightbox__layer-stack");
    if (!stack) return;
    const cards = [
        { id: "background", title: layers.background?.label || "Composición", kind: "background", deletable: false, section: "composition" },
        { id: "graphic", title: layers.graphic?.label || "Elementos IA", kind: "graphic", deletable: false, section: "elements" },
        { id: "text", title: layers.textLayer?.label || "Texto editorial", kind: "text", deletable: false, section: "text" },
        ...(Array.isArray(layers.extraLayers) ? layers.extraLayers.map((item) => ({
            id: item.id,
            title: item.label || "Capa extra",
            kind: "extra",
            deletable: true,
            section: "elements"
        })) : [])
    ];
    stack.innerHTML = cards.map((card) => `
        <section class="cb-module-graphic-layer-card is-${card.kind}" data-layer-card="${escapeHtml(card.id)}" data-layer-panel="${escapeHtml(card.section)}">
            <div class="cb-module-graphic-layer-card__head">
                <div>
                    <div class="cb-module-graphic-layer-card__title">${escapeHtml(card.title)}</div>
                    <div class="cb-module-graphic-layer-card__meta">${card.kind === "extra" ? "Capa adicional" : card.section === "composition" ? "Base visual" : card.section === "elements" ? "Assets y capas" : "Jerarquía editorial"}</div>
                </div>
                <div class="cb-module-graphic-layer-card__actions">
                    <button type="button" data-layer-command="edit" data-layer-id="${escapeHtml(card.id)}"><i class="fas fa-pen"></i><span>Editar prompt</span></button>
                    <button type="button" data-layer-command="regenerate" data-layer-id="${escapeHtml(card.id)}"><i class="fas fa-arrows-rotate"></i><span>Regenerar</span></button>
                    ${card.deletable ? `<button type="button" data-layer-command="delete" data-layer-id="${escapeHtml(card.id)}"><i class="fas fa-trash"></i><span>Eliminar</span></button>` : ""}
                </div>
            </div>
            <div class="cb-module-graphic-lightbox__layer-body"></div>
            <textarea class="cb-module-graphic-layer-card__editor" data-layer-editor="${escapeHtml(card.id)}" disabled>${escapeHtml(getLayerPromptValue(layers, card.id))}</textarea>
        </section>
    `).join("");
}

function eliminarLayerEditable(layers = {}, layerId = "") {
    if (!Array.isArray(layers.extraLayers)) return;
    layers.extraLayers = layers.extraLayers.filter((item) => item?.id !== layerId);
}

function actualizarLayerDesdePrompt(layers = {}, layerId = "", prompt = "") {
    const lines = String(prompt || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (layerId === "background") {
        layers.background.description = lines[0] || "";
        const colorLine = lines.find((line) => /^color:/i.test(line));
        if (colorLine) {
            layers.background.color = colorLine.replace(/^color:\s*/i, "").trim();
        }
        const paletteLine = lines.find((line) => /^paleta:/i.test(line));
        if (paletteLine) {
            layers.background.palette = paletteLine.replace(/^paleta:\s*/i, "").trim();
        }
        return;
    }
    if (layerId === "graphic") {
        layers.graphic.description = lines[0] || "";
        const itemLines = lines.slice(1);
        layers.graphic.anchors = itemLines.map((line, index) => ({
            id: `anchor-${index + 1}`,
            label: line,
            shape: "marker",
            position: sanitizeLayerPositionName("", ["middle-left", "top-right", "center", "bottom-left"][index] || "center")
        }));
        layers.graphic.focus = itemLines.slice(0, 6);
        layers.graphic.elements = [];
        return;
    }
    if (layerId === "text") {
        layers.textLayer.title = lines[0] || "";
        layers.textLayer.subtitle = lines[1] || "";
        const extraLines = lines.slice(2);
        layers.textLayer.labels = extraLines.slice(0, 4).map((line, index) => ({
            id: `label-${index + 1}`,
            text: line,
            anchorId: String(layers.graphic?.anchors?.[index]?.id || `anchor-${index + 1}`),
            position: ["top-left", "top-right", "middle-right", "bottom-left"][index] || "bottom-right"
        }));
        layers.textLayer.legend = extraLines.slice(4, 7);
        layers.textLayer.connectors = layers.textLayer.labels.map((item, index) => ({
            id: `connector-${index + 1}`,
            labelId: item.id,
            anchorId: item.anchorId
        }));
        return;
    }
    const extra = (Array.isArray(layers.extraLayers) ? layers.extraLayers : []).find((item) => item?.id === layerId);
    if (extra) {
        extra.prompt = String(prompt || "").trim();
        extra.label = extra.prompt.split(/\r?\n/)[0]?.trim() || extra.label || "Capa extra";
    }
}

function renderCanvasMeta(modal) {
    const target = modal.querySelector(".cb-module-graphic-lightbox__canvas-meta");
    if (!target) return;
    const spec = getGraphicCanvasSpec();
    const context = modal?.__graphicContext || {};
    const layers = normalizeEditableGraphicLayers(modal?.__graphicLayers || {});
    const invalidCount = (Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements : [])
        .filter((item) => item?.validation?.recommendation === "regenerate")
        .length;
    target.innerHTML = `
        <div class="cb-module-graphic-lightbox__meta-line">${escapeHtml(spec.label)}</div>
        <div class="cb-module-graphic-lightbox__meta-line">${escapeHtml(String(context.moduleName || "Módulo gráfico").trim() || "Módulo gráfico")}</div>
        <div class="cb-module-graphic-lightbox__meta-line">${invalidCount ? `${invalidCount} elemento(s) requieren regeneración` : "Composición lista para revisión"}</div>
    `;
    const stage = modal.querySelector(".cb-module-graphic-lightbox__stage");
    if (stage) {
        stage.style.setProperty("--cb-stage-width", `${spec.width}px`);
        stage.style.setProperty("--cb-stage-height", `${spec.height}px`);
    }
}

function renderGraphicItemsLayer(modal, graphicLayer = {}) {
    const target = modal.querySelector(".cb-module-graphic-lightbox__graphic-layer");
    if (!target) return;
    const isEditMode = getGraphicLightboxMode(modal) === "edit";
    const anchors = Array.isArray(graphicLayer?.anchors) ? graphicLayer.anchors : [];
    const elements = Array.isArray(graphicLayer?.elements) ? graphicLayer.elements : [];
    const elementMarkup = elements.map((item, index) => {
        const linkedAnchorIndex = anchors.findIndex((anchor) => String(anchor?.id || "").trim() === String(item?.anchorId || "").trim());
        const anchor = linkedAnchorIndex >= 0 ? anchors[linkedAnchorIndex] : anchors[index];
        const anchorPos = getAnchorStagePosition(anchor || {}, linkedAnchorIndex >= 0 ? linkedAnchorIndex : index, anchors.length || elements.length || 1);
        const manual = item?.manualPosition && typeof item.manualPosition === "object" ? item.manualPosition : null;
        const pos = manual || getUnplacedGraphicLayerPosition(index);
        const src = String(item?.maskedImageUrl || item?.imageUrl || "").trim();
        if (!src) return "";
        const requiresFix = item?.validation?.recommendation === "regenerate";
        const isPlaced = item?.placed === true || !!manual;
        if (!isEditMode && !isPlaced) return "";
        return `
            <div class="cb-module-graphic-lightbox__graphic-element cb-module-graphic-lightbox__draggable ${requiresFix ? "is-invalid" : ""} ${isPlaced ? "is-placed" : "is-unplaced"}"
                 data-drag-kind="graphic"
                 data-graphic-role="element"
                 data-element-id="${escapeHtml(String(item?.id || `element-${index + 1}`))}"
                 style="left:${clampPercent(pos.x, 2, 86)}%;top:${clampPercent(pos.y, 4, 84)}%;">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(String(item?.label || `Elemento ${index + 1}`))}">
                ${requiresFix && isEditMode ? `<span class="cb-module-graphic-lightbox__asset-warning">Requiere regeneración</span>` : ""}
                ${!isPlaced && isEditMode ? `<span class="cb-module-graphic-lightbox__asset-warning is-neutral">Sin colocar</span>` : ""}
            </div>
        `;
    }).join("");
    const anchorsMarkup = !isEditMode ? "" : anchors.map((item, index) => {
        const pos = getAnchorStagePosition(item, index, anchors.length);
        const shape = String(item?.shape || "marker").trim().toLowerCase() || "marker";
        return `
            <div class="cb-module-graphic-lightbox__graphic-anchor cb-module-graphic-lightbox__draggable is-${escapeHtml(shape)}"
                 data-drag-kind="graphic"
                 data-graphic-role="anchor"
                 data-anchor-id="${escapeHtml(String(item?.id || `anchor-${index + 1}`))}"
                 style="left:${clampPercent(pos.x, 2, 86)}%;top:${clampPercent(pos.y, 4, 84)}%;">
                <span class="cb-module-graphic-lightbox__anchor-dot"></span>
            </div>
        `;
    }).join("");
    target.innerHTML = `${elementMarkup}${anchorsMarkup}`;
}

function renderCustomGraphicLayers(modal, layers = {}) {
    const target = modal.querySelector(".cb-module-graphic-lightbox__custom-layer");
    if (!target) return;
    const isEditMode = getGraphicLightboxMode(modal) === "edit";
    const items = Array.isArray(layers.extraLayers) ? layers.extraLayers : [];
    target.innerHTML = items.map((item, index) => {
        const manual = item?.manualPosition && typeof item.manualPosition === "object" ? item.manualPosition : null;
        const isPlaced = item?.placed === true || !!manual;
        const pos = manual || getUnplacedGraphicLayerPosition(index + 1);
        const src = String(item?.maskedImageUrl || item?.imageUrl || "").trim();
        const requiresFix = item?.validation?.recommendation === "regenerate";
        if (!isEditMode && !isPlaced) return "";
        return `
            <div class="cb-module-graphic-lightbox__custom-item cb-module-graphic-lightbox__graphic-element cb-module-graphic-lightbox__draggable ${requiresFix ? "is-invalid" : ""} ${isPlaced ? "is-placed" : "is-unplaced"}"
                 data-drag-kind="custom"
                 data-element-kind="custom"
                 data-element-id="${escapeHtml(String(item?.id || `custom-${index + 1}`))}"
                 data-layer-id="${escapeHtml(String(item?.id || `custom-${index + 1}`))}"
                 style="left:${clampPercent(pos.x, 2, 86)}%;top:${clampPercent(pos.y, 4, 84)}%;">
                ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(item?.label || `Capa extra ${index + 1}`))}">` : `<div class="cb-module-graphic-lightbox__custom-placeholder">${escapeHtml(item?.label || `Capa extra ${index + 1}`)}</div>`}
                ${requiresFix && isEditMode ? `<span class="cb-module-graphic-lightbox__asset-warning">Requiere regeneración</span>` : ""}
                ${!isPlaced && isEditMode ? `<span class="cb-module-graphic-lightbox__asset-warning is-neutral">Sin colocar</span>` : ""}
            </div>
        `;
    }).join("");
}

function renderGraphicTextLayer(modal, textLayer = {}) {
    const target = modal.querySelector(".cb-module-graphic-lightbox__text-layer");
    if (!target) return;
    const stage = modal.querySelector(".cb-module-graphic-lightbox__stage");
    const isEditMode = getGraphicLightboxMode(modal) === "edit";
    const layers = normalizeEditableGraphicLayers(modal?.__graphicLayers || {});
    const anchors = Array.isArray(layers?.graphic?.anchors) ? layers.graphic.anchors : [];
    const title = String(textLayer?.title || "").trim();
    const subtitle = String(textLayer?.subtitle || "").trim();
    const legend = Array.isArray(textLayer?.legend) ? textLayer.legend : [];
    const labels = Array.isArray(textLayer?.labels) ? textLayer.labels : [];
    const connectors = Array.isArray(textLayer?.connectors) ? textLayer.connectors : [];
    const titlePosition = textLayer?.titleManualPosition || { x: 6, y: 5 };
    const subtitlePosition = textLayer?.subtitleManualPosition || {
        x: 6,
        y: 11
    };
    const legendPosition = textLayer?.legendManualPosition || { x: 70, y: 74 };
    const legendBox = legend.length
        ? `<div class="cb-module-graphic-lightbox__text-box cb-module-graphic-lightbox__draggable is-legend"
                data-drag-kind="text"
                data-text-role="legend"
                style="left:${clampPercent(legendPosition.x, 2, 86)}%;top:${clampPercent(legendPosition.y, 4, 84)}%;">
                <ul class="cb-module-graphic-lightbox__legend">${legend.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
           </div>`
        : "";
    const labelBoxes = labels.map((item, index) => {
        const linkedAnchorIndex = anchors.findIndex((anchor) => String(anchor?.id || "").trim() === String(item?.anchorId || "").trim());
        const anchor = linkedAnchorIndex >= 0 ? anchors[linkedAnchorIndex] : anchors[index];
        const anchorPos = getAnchorStagePosition(anchor || {}, linkedAnchorIndex >= 0 ? linkedAnchorIndex : index, anchors.length || labels.length || 1);
        const placement = String(item?.placement || item?.position || "").trim().toLowerCase() || inferLabelPlacementFromAnchor(anchorPos);
        const pos = item?.manualPosition && typeof item.manualPosition === "object"
            ? item.manualPosition
            : getLabelPositionFromAnchor(anchorPos, placement);
        return `
            <div class="cb-module-graphic-lightbox__text-box cb-module-graphic-lightbox__label-box cb-module-graphic-lightbox__draggable is-callout"
                 data-drag-kind="text"
                 data-label-id="${escapeHtml(String(item?.id || `label-${index + 1}`))}"
                 data-anchor-id="${escapeHtml(String(item?.anchorId || ""))}"
                 data-label-placement="${escapeHtml(placement)}"
                 style="left:${clampPercent(pos.x, 2, 86)}%;top:${clampPercent(pos.y, 4, 84)}%;">
                ${escapeHtml(item?.text || "")}
            </div>
        `;
    }).join("");
    if (isEditMode) {
        renderGraphicConnectorOverlay(target, connectors);
    } else {
        target.innerHTML = "";
    }
    target.insertAdjacentHTML("beforeend", `
        ${title ? `<div class="cb-module-graphic-lightbox__text-box cb-module-graphic-lightbox__draggable is-title" data-drag-kind="text" data-text-role="title" style="left:${clampPercent(titlePosition.x, 2, 86)}%;top:${clampPercent(titlePosition.y, 4, 84)}%;"><div class="cb-module-graphic-lightbox__text-title">${escapeHtml(title)}</div></div>` : ""}
        ${subtitle ? `<div class="cb-module-graphic-lightbox__text-box cb-module-graphic-lightbox__draggable is-subtitle" data-drag-kind="text" data-text-role="subtitle" style="left:${clampPercent(subtitlePosition.x, 2, 86)}%;top:${clampPercent(subtitlePosition.y, 4, 84)}%;"><div class="cb-module-graphic-lightbox__text-subtitle">${escapeHtml(subtitle)}</div></div>` : ""}
        ${labelBoxes}
        ${legendBox}
    `.trim());
    if (stage) {
        requestAnimationFrame(() => updateGraphicConnectorLayout(modal));
    }
}

function renderGraphicLayerSummaries(modal, layers = {}) {
    renderGraphicLayerCard(modal, "background", [
        layers?.background?.label || "Composición",
        layers?.background?.description || "Base visual del gráfico final.",
        layers?.background?.color ? `Color plano: ${layers.background.color}` : "",
        layers?.background?.palette ? `Paleta: ${layers.background.palette}` : "",
        "La vista final oculta ayudas técnicas y muestra solo el resultado editorial."
    ]);
    renderGraphicLayerCard(modal, "graphic", [
        layers?.graphic?.label || "Elementos IA",
        layers?.graphic?.description || "Assets aislados ubicados sobre anchors de composición.",
        ...(Array.isArray(layers?.graphic?.anchors) ? layers.graphic.anchors.map((item) => item?.label || "") : []),
        ...(Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements.map((item) => item?.label ? `Elemento: ${item.label}` : "").filter(Boolean) : []),
        ...(Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements.map((item) => item?.validation?.recommendation === "regenerate" ? `Corregir: ${item.label || "asset"}` : "").filter(Boolean) : []),
        ...(Array.isArray(layers?.graphic?.focus) ? layers.graphic.focus : [])
    ]);
    renderGraphicLayerCard(modal, "text", [
        layers?.textLayer?.label || "Texto editorial",
        layers?.textLayer?.title || "",
        layers?.textLayer?.subtitle || "",
        ...(Array.isArray(layers?.textLayer?.labels) ? layers.textLayer.labels.map((item) => item?.text || "") : []),
        ...(Array.isArray(layers?.textLayer?.legend) ? layers.textLayer.legend : [])
    ]);
    (Array.isArray(layers?.extraLayers) ? layers.extraLayers : []).forEach((item, index) => {
        renderGraphicLayerCard(modal, String(item?.id || `custom-${index + 1}`), [
            item?.label || `Capa extra ${index + 1}`,
            item?.prompt || "Sin prompt definido para esta capa.",
            item?.imageUrl ? "Imagen generada para esta capa." : "Esta capa todavía no tiene imagen generada.",
            item?.validation?.recommendation === "regenerate" ? "Requiere regeneración antes de exportar." : "",
            item?.placed === true || (item?.manualPosition && typeof item?.manualPosition === "object") ? "Colocada manualmente en el canvas." : "Pendiente de colocación manual."
        ]);
    });
}

function renderGraphicExportPanel(modal, layers = {}) {
    const panel = modal.querySelector('.cb-module-graphic-lightbox__export-panel');
    if (!panel) return;
    const elements = [
        ...(Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements : []),
        ...(Array.isArray(layers?.extraLayers) ? layers.extraLayers : [])
    ];
    const invalid = elements.filter((item) => item?.validation?.recommendation === "regenerate");
    const unplaced = elements.filter((item) => !(item?.placed === true || (item?.manualPosition && typeof item.manualPosition === "object")));
    panel.innerHTML = `
        <section class="cb-module-graphic-lightbox__export-card">
            <h4>Salida final</h4>
            <p>Cada elemento vive en su propia capa de imagen. La composición final solo se exporta cuando todas las capas válidas ya fueron colocadas manualmente.</p>
            <div class="cb-module-graphic-lightbox__export-summary ${(invalid.length || unplaced.length) ? "is-warning" : "is-ready"}">
                ${invalid.length
                    ? `${invalid.length} elemento(s) deben regenerarse antes de exportar la composición.`
                    : unplaced.length
                        ? `${unplaced.length} capa(s) siguen sin colocar manualmente en el canvas.`
                        : "La composición está lista para exportación SVG."}
            </div>
        </section>
    `;
}

function renderGraphicSelectionPanel(modal, layers = {}) {
    const panel = modal.querySelector(".cb-module-graphic-lightbox__selection-panel");
    if (!panel) return;
    const state = getGraphicSelectionState(modal);
    const selected = findGraphicSelectionTarget(layers, state);
    if (!selected) {
        panel.innerHTML = `
            <section class="cb-module-graphic-lightbox__selection-card">
                <h4>Herramientas de capa</h4>
                <p>Selecciona un asset en el canvas para aplicar varita mágica, invertir selección y crear máscara de recorte.</p>
            </section>
        `;
        return;
    }
    panel.innerHTML = `
        <section class="cb-module-graphic-lightbox__selection-card">
            <h4>${escapeHtml(selected.label || "Capa seleccionada")}</h4>
            <p>La varita mágica trabaja sobre esta imagen sin quitar el fondo de origen. La máscara se aplica solo a la capa seleccionada.</p>
            <div class="cb-module-graphic-lightbox__selection-tools">
                <button type="button" class="cb-module-graphic-lightbox__tool-btn ${state.wandArmed ? "is-active" : ""}" data-layer-command="arm-wand">
                    <i class="fas fa-wand-magic-sparkles"></i><span>Varita mágica</span>
                </button>
                <button type="button" class="cb-module-graphic-lightbox__tool-btn ${state.invert ? "is-active" : ""}" data-layer-command="toggle-mask-invert">
                    <i class="fas fa-circle-notch"></i><span>Seleccionar inverso</span>
                </button>
                <button type="button" class="cb-module-graphic-lightbox__tool-btn" data-layer-command="clear-mask">
                    <i class="fas fa-eraser"></i><span>Quitar máscara</span>
                </button>
            </div>
            <label class="cb-module-graphic-lightbox__slider">
                <span>Tolerancia</span>
                <input type="range" min="4" max="80" step="1" value="${Math.round(Number(selected.maskTolerance || state.tolerance || 26))}" data-layer-command="mask-tolerance">
            </label>
            <div class="cb-module-graphic-lightbox__selection-meta">
                <span>${selected.maskedImageUrl ? "Máscara activa" : "Sin máscara aplicada"}</span>
                <span>${selected.placed ? "Capa colocada" : "Capa sin colocar"}</span>
                <span>${state.elementKind === "custom" ? "Capa extra" : "Elemento IA"}</span>
            </div>
        </section>
    `;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("No se pudo convertir el blob a data URL."));
        reader.readAsDataURL(blob);
    });
}

function loadImageFromUrlForMask(src = "") {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("No se pudo cargar la imagen para la máscara."));
        image.src = src;
    });
}

function colorDistanceSq(data, index, target) {
    const dr = data[index] - target.r;
    const dg = data[index + 1] - target.g;
    const db = data[index + 2] - target.b;
    return (dr * dr) + (dg * dg) + (db * db);
}

async function createMagicMaskFromImageUrl(imageUrl = "", clickX = 0, clickY = 0, tolerance = 26, invert = false) {
    const imageDataUrl = await resolveImageHrefForSvg(imageUrl);
    const image = await loadImageFromUrlForMask(imageDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("No se pudo inicializar el canvas de máscara.");
    ctx.drawImage(image, 0, 0);
    const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = ctx.createImageData(canvas.width, canvas.height);
    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(clickX)));
    const py = Math.max(0, Math.min(canvas.height - 1, Math.round(clickY)));
    const targetIndex = ((py * canvas.width) + px) * 4;
    const target = {
        r: source.data[targetIndex],
        g: source.data[targetIndex + 1],
        b: source.data[targetIndex + 2]
    };
    const limit = Math.pow(Math.max(4, Number(tolerance) || 26), 2) * 3;

    for (let index = 0; index < source.data.length; index += 4) {
        const similar = colorDistanceSq(source.data, index, target) <= limit;
        const keep = invert ? !similar : similar;
        mask.data[index] = source.data[index];
        mask.data[index + 1] = source.data[index + 1];
        mask.data[index + 2] = source.data[index + 2];
        mask.data[index + 3] = keep ? source.data[index + 3] : 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(mask, 0, 0);
    return {
        maskedImageUrl: canvas.toDataURL("image/png"),
        selection: {
            x: px,
            y: py,
            tolerance: Math.max(4, Number(tolerance) || 26),
            invert: invert === true
        }
    };
}

async function resolveImageHrefForSvg(imageHref = "") {
    const src = String(imageHref || "").trim();
    if (!src) return "";
    if (/^data:/i.test(src)) return src;
    let requestUrl = src;
    if (/^https?:\/\//i.test(src)) {
        requestUrl = buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(src)}`);
    }
    const response = await fetch(requestUrl, { mode: "cors" });
    if (!response.ok) {
        throw new Error(`No se pudo descargar la imagen para el SVG (${response.status}).`);
    }
    const blob = await response.blob();
    return blobToDataUrl(blob);
}

async function buildGraphicSvgMarkup(modal) {
    const layers = normalizeEditableGraphicLayers(modal?.__graphicLayers || {});
    const imageNode = modal?.querySelector(".cb-module-graphic-lightbox__image");
    const imageHref = String(imageNode?.getAttribute("src") || "").trim();
    const embeddedImageHref = await resolveImageHrefForSvg(imageHref).catch(() => "");
    const width = 1024;
    const height = 1024;
    const anchors = Array.isArray(layers?.graphic?.anchors) ? layers.graphic.anchors : [];
    const elements = Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements : [];
    const extraLayers = Array.isArray(layers?.extraLayers) ? layers.extraLayers : [];
    const validElements = [
        ...elements,
        ...extraLayers
    ].filter((item) => item?.validation?.recommendation !== "regenerate" && (item?.placed === true || (item?.manualPosition && typeof item?.manualPosition === "object")));
    const title = String(layers?.textLayer?.title || "").trim();
    const subtitle = String(layers?.textLayer?.subtitle || "").trim();
    const labels = Array.isArray(layers?.textLayer?.labels) ? layers.textLayer.labels : [];
    const legend = Array.isArray(layers?.textLayer?.legend) ? layers.textLayer.legend : [];
    const titlePos = layers?.textLayer?.titleManualPosition || { x: 8, y: 8 };
    const subtitlePos = layers?.textLayer?.subtitleManualPosition || { x: 8, y: 15 };
    const legendPos = layers?.textLayer?.legendManualPosition || { x: 70, y: 79 };

    const anchorMap = new Map();
    anchors.forEach((anchor, index) => {
        const pos = getAnchorStagePosition(anchor, index, anchors.length || 1);
        anchorMap.set(String(anchor?.id || `anchor-${index + 1}`), {
            x: (pos.x / 100) * width,
            y: (pos.y / 100) * height
        });
    });

    const graphicElementMarkupParts = await Promise.all(validElements.map(async (item, index) => {
        const src = String(item?.maskedImageUrl || item?.imageUrl || "").trim();
        if (!src) return "";
        const anchor = anchorMap.get(String(item?.anchorId || "").trim()) || { x: width / 2, y: height / 2 };
        const anchorPercent = { x: (anchor.x / width) * 100, y: (anchor.y / height) * 100 };
        const pos = item?.manualPosition && typeof item.manualPosition === "object"
            ? item.manualPosition
            : anchorPercent;
        const x = (clampPercent(pos.x, 0, 100) / 100) * width;
        const y = (clampPercent(pos.y, 0, 100) / 100) * height;
        const embedded = await resolveImageHrefForSvg(src).catch(() => "");
        if (!embedded) return "";
        const size = 150;
        return `<image href="${escapeHtml(embedded)}" x="${x - (size / 2)}" y="${y - (size / 2)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" />`;
    }));
    const graphicElementMarkup = graphicElementMarkupParts.join("");
    const labelMarkup = labels.map((label, index) => {
        const anchor = anchorMap.get(String(label?.anchorId || "").trim()) || { x: width / 2, y: height / 2 };
        const anchorPercent = { x: (anchor.x / width) * 100, y: (anchor.y / height) * 100 };
        const placement = String(label?.placement || label?.position || "").trim().toLowerCase() || inferLabelPlacementFromAnchor(anchorPercent);
        const pos = label?.manualPosition && typeof label.manualPosition === "object"
            ? label.manualPosition
            : getLabelPositionFromAnchor(anchorPercent, placement);
        return `<text x="${(pos.x / 100) * width}" y="${(pos.y / 100) * height}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#10203a">${escapeHtml(String(label?.text || "").trim())}</text>`;
    }).join("");
    const legendMarkup = legend.map((item, index) => {
        const x = (legendPos.x / 100) * width;
        const y = ((legendPos.y / 100) * height) + (index * 28);
        return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="21" font-weight="600" fill="#29405f">${escapeHtml(String(item || "").trim())}</text>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g id="layer-background">
    <rect x="0" y="0" width="${width}" height="${height}" fill="${escapeHtml(String(layers?.background?.color || "#FFFFFF"))}" />
  </g>
  <g id="layer-image">
    ${embeddedImageHref ? `<image href="${escapeHtml(embeddedImageHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />` : ""}
  </g>
  <g id="layer-graphic-elements">
    ${graphicElementMarkup}
  </g>
  <g id="layer-editorial-text">
    ${title ? `<text x="${(titlePos.x / 100) * width}" y="${(titlePos.y / 100) * height}" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#10203a">${escapeHtml(title)}</text>` : ""}
    ${subtitle ? `<text x="${(subtitlePos.x / 100) * width}" y="${(subtitlePos.y / 100) * height}" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="#29405f">${escapeHtml(subtitle)}</text>` : ""}
    ${labelMarkup}
    ${legendMarkup}
  </g>
</svg>`;
}

async function descargarGraficoModuloComoSvg(modal) {
    const layers = normalizeEditableGraphicLayers(modal?.__graphicLayers || {});
    const exportableLayers = [
        ...(Array.isArray(layers?.graphic?.elements) ? layers.graphic.elements : []),
        ...(Array.isArray(layers?.extraLayers) ? layers.extraLayers : [])
    ];
    const invalid = exportableLayers
        .filter((item) => item?.validation?.recommendation === "regenerate");
    const unplaced = exportableLayers
        .filter((item) => !(item?.placed === true || (item?.manualPosition && typeof item.manualPosition === "object")));
    if (invalid.length) {
        throw new Error("No se puede descargar el SVG mientras existan elementos pendientes de regeneración.");
    }
    if (unplaced.length) {
        throw new Error("Coloca manualmente todas las capas antes de descargar el SVG.");
    }
    const markup = await buildGraphicSvgMarkup(modal);
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const title = String(modal?.querySelector(".cb-module-graphic-lightbox__caption")?.textContent || "grafico-modulo").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    anchor.href = url;
    anchor.download = `${title || "grafico-modulo"}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function applyGraphicDatasetsToNode(node, payload = {}) {
    if (!node) return;
    if (payload.src) {
        node.dataset.mcImageSrc = payload.src;
        if (node.tagName === "IMG") node.src = payload.src;
    }
    if (payload.alt) {
        node.dataset.mcImageAlt = payload.alt;
        if (node.tagName === "IMG") node.alt = payload.alt;
    }
    if (payload.layers) node.dataset.mcImageLayers = payload.layers;
    if (payload.moduleId) node.dataset.mcModuloId = payload.moduleId;
    if (payload.courseId) node.dataset.mcCourseId = payload.courseId;
    if (payload.moduleName) node.dataset.mcModuleName = payload.moduleName;
    if (payload.moduleType) node.dataset.mcModuleType = payload.moduleType;
}

function inferGraphicContextFromNode(sourceEl = null) {
    const element = sourceEl && typeof sourceEl === "object" && sourceEl.nodeType === 1 ? sourceEl : null;
    if (!element) {
        return {
            moduleId: "",
            courseId: String(window.curso?.id || "").trim(),
            moduleName: "",
            moduleType: ""
        };
    }
    const contentHost = element.closest('[id^="contenido-"]');
    const moduleId = String(contentHost?.id || "").replace(/^contenido-/, "").trim();
    const moduleCard = moduleId ? document.getElementById(`modulo-${moduleId}`) : null;
    const moduleName = String(
        moduleCard?.querySelector('[data-mc-action="ejecutar-generacion-modulo-gemini"]')?.dataset?.mcModuleName
        || moduleCard?.querySelector("h3")?.textContent
        || moduleCard?.querySelector(".font-semibold")?.textContent
        || ""
    ).trim();
    const moduleType = String(
        moduleCard?.querySelector(".text-sm.text-slate-700")?.textContent
        || moduleCard?.querySelector(".text-xs.text-gray-500")?.textContent
        || ""
    ).trim();
    return {
        moduleId,
        courseId: String(window.curso?.id || "").trim(),
        moduleName,
        moduleType
    };
}

async function persistRegeneratedModuleGraphic({ modal, image, layers }) {
    const context = modal?.__graphicContext || {};
    const moduleId = String(context.moduleId || "").trim();
    const courseId = String(context.courseId || "").trim();
    if (!moduleId || !courseId) return;
    const contentNode = document.getElementById(`contenido-${moduleId}`);
    const figure = contentNode?.querySelector(".cb-module-generated-graphic");
    if (!figure) return;
    const currentImage = figure.querySelector("img");
    const downloadUrl = String(image?.downloadUrl || currentImage?.dataset?.mcImageSrc || currentImage?.getAttribute("src") || "").trim();
    if (!downloadUrl) return;
    const mergedLayers = mergeSimplePreviewIntoLayers(modal, layers || {});
    const encodedLayers = encodeURIComponent(JSON.stringify(mergedLayers || {}));
    const alt = String(modal.querySelector(".cb-module-graphic-lightbox__image")?.alt || "Gráfico del módulo").trim();
    figure.setAttribute("data-storage-path", String(image?.storagePath || figure.getAttribute("data-storage-path") || "").trim());
    figure.setAttribute("data-mime-type", String(image?.mimeType || figure.getAttribute("data-mime-type") || "image/png").trim() || "image/png");
    figure.setAttribute("data-model", String(image?.model || figure.getAttribute("data-model") || "").trim());
    applyGraphicDatasetsToNode(currentImage, {
        src: downloadUrl,
        alt,
        layers: encodedLayers,
        moduleId,
        courseId,
        moduleName: String(context.moduleName || "").trim(),
        moduleType: String(context.moduleType || "").trim()
    });
    figure.querySelectorAll('[data-mc-action="abrir-galeria-grafico-modulo"]').forEach((node) => {
        applyGraphicDatasetsToNode(node, {
            src: downloadUrl,
            alt,
            layers: encodedLayers,
            moduleId,
            courseId,
            moduleName: String(context.moduleName || "").trim(),
            moduleType: String(context.moduleType || "").trim()
        });
    });
    renderModuleGraphicInlinePreview(figure, mergedLayers);
    const contentNodeForSave = contentNode.cloneNode(true);
    contentNodeForSave.querySelectorAll(".cb-module-generated-graphic").forEach((node) => cleanupModuleGraphicInlinePreview(node));
    const saveHtml = typeof window.normalizarContenidoModuloPersistible === "function"
        ? window.normalizarContenidoModuloPersistible(contentNodeForSave.innerHTML)
        : contentNodeForSave.innerHTML;
    await guardarModulo(moduleId, {
        contenido: saveHtml,
        graficoGenerado: {
            downloadUrl,
            storagePath: String(image?.storagePath || figure.getAttribute("data-storage-path") || "").trim(),
            mimeType: String(image?.mimeType || figure.getAttribute("data-mime-type") || "image/png").trim() || "image/png",
            model: String(image?.model || figure.getAttribute("data-model") || "").trim(),
            promptVersion: String(image?.promptVersion || "").trim(),
            updatedAt: String(image?.updatedAt || new Date().toISOString()).trim(),
            layers: mergedLayers
        }
    }, courseId);
}

async function regenerateGraphicLayerImage(modal, layers = {}, prompt = "") {
    const context = modal?.__graphicContext || {};
    const moduleId = String(context.moduleId || "").trim();
    const courseId = String(context.courseId || "").trim();
    if (!moduleId || !courseId) {
        throw new Error("Falta el contexto del módulo para regenerar el gráfico.");
    }
    const modulo = await obtenerModulo(moduleId, courseId);
    if (!modulo) {
        throw new Error("No se encontró el módulo para regenerar el gráfico.");
    }
    const response = await authFetchJson("/api/moodle/module-graphics/generate", {
        method: "POST",
        body: {
            courseId,
            moduleId,
            moduleType: String(context.moduleType || modulo.tipo || "").trim(),
            moduleName: String(context.moduleName || modulo.nombre || "").trim(),
            languageCode: "es",
            instructions: String(modulo.instrucciones || "").trim(),
            content: [String(modulo.contenido || "").trim(), prompt ? `Prompt capa gráfica:\n${prompt}` : ""].filter(Boolean).join("\n\n"),
            previousStoragePath: String(modulo?.graficoGenerado?.storagePath || "").trim(),
            regenerate: true
        }
    });
    const image = response?.image && typeof response.image === "object" ? response.image : null;
    if (!image?.downloadUrl) {
        throw new Error("No se recibió un gráfico válido al regenerar la capa.");
    }
    const imageNode = modal.querySelector(".cb-module-graphic-lightbox__image");
    if (imageNode) {
        imageNode.src = image.downloadUrl;
    }
    await persistRegeneratedModuleGraphic({ modal, image, layers });
}

function buildPromptForGraphicElement(anchor = {}, basePrompt = "", modulo = {}) {
    const anchorLabel = String(anchor?.label || "").trim();
    const moduloNombre = String(modulo?.nombre || "Módulo").trim();
    const moduloTipo = String(modulo?.tipo || "Módulo").trim();
    const rawContext = String(basePrompt || "").trim();
    const normalizedContext = rawContext.toLowerCase();
    const isMath = /\b(recta|n[uú]mero|números|algebra|ecuaci[oó]n|fracci[oó]n|operaci[oó]n|piso|lobby|positivo|negativo)\b/i.test(rawContext);
    const isLanguage = /\b(language|grammar|vocabulary|prefijo|sufijo|word formation|clil|funciones del lenguaje)\b/i.test(rawContext);
    const isScience = /\b(science|cient[ií]fico|proceso|laboratorio|experimento|energ[ií]a|ecosistema)\b/i.test(rawContext);
    const visualStyle = isMath
        ? "infografía matemática vectorial, didáctica, clara, geométrica"
        : (isLanguage
            ? "ilustración editorial educativa con iconografía lingüística y símbolos claros"
            : (isScience
                ? "infografía científica limpia con iconos técnicos y jerarquía visual"
                : "gráfico educativo editorial limpio, moderno y didáctico"));
    const compositionHint = /top|left|right|bottom|middle|center/i.test(String(anchor?.position || ""))
        ? `Composición sugerida: ubica el sujeto principal con peso visual hacia ${String(anchor?.position || "").trim().toLowerCase()}.`
        : "Composición sugerida: sujeto único centrado con margen amplio para etiquetas externas.";
    const subjectDirective = anchorLabel
        ? `Sujeto principal obligatorio: "${anchorLabel}". Representarlo de forma inequívoca y reconocible.`
        : "Sujeto principal obligatorio: un único elemento visual claramente identificable.";
    const avoidDirective = normalizedContext.includes("hotel") || normalizedContext.includes("lobby")
        ? "Evita ambientes complejos de estudio, oficinas o sets cinematográficos."
        : "Evita escenas narrativas completas: produce un asset aislado para composición por capas.";

    return [
        "=== BRIEF DE DIRECCIÓN DE ARTE ===",
        `Proyecto: ${moduloNombre} (${moduloTipo}).`,
        subjectDirective,
        `Estilo visual objetivo: ${visualStyle}.`,
        compositionHint,
        rawContext ? `Contexto pedagógico del módulo: ${rawContext}` : "",
        "",
        "=== ESPECIFICACIÓN TÉCNICA DEL ASSET ===",
        "Generar UNA imagen por capa para pipeline de composición manual.",
        "Usa fondo blanco uniforme y limpio en toda la imagen de la capa.",
        "No uses fondos de color distintos, degradados ni escenas ambientadas.",
        "Mantén solo el contexto visual minimo necesario sobre ese fondo blanco.",
        "La separación fina se hará manualmente con máscaras dentro del editor.",
        "",
        "=== CALIDAD VISUAL ===",
        "Lectura inmediata en 2 segundos.",
        "Contorno limpio, contraste alto, detalle medio/alto.",
        "Paleta controlada y consistente con material escolar.",
        "Sin ruido visual, sin artefactos, sin deformaciones.",
        "",
        "=== NEGATIVOS (PROHIBIDO) ===",
        "No texto, no letras, no números, no etiquetas, no watermarks, no logos, no UI.",
        "No compongas varias capas diferentes en una sola imagen.",
        avoidDirective,
        "",
        "=== OBJETIVO DE USO ===",
        "Este asset vivirá en su propia capa y se posicionará manualmente.",
        "Debe conservar suficiente información visual para usar varita mágica, selección inversa y máscaras de recorte."
    ].filter(Boolean).join("\n");
}

async function generarElementoGraficoCapa({ modal, modulo, anchor, prompt, previousStoragePath = "" }) {
    const context = modal?.__graphicContext || {};
    const courseId = String(context.courseId || "").trim();
    const moduleId = String(context.moduleId || "").trim();
    const moduleName = String(context.moduleName || modulo?.nombre || "").trim();
    const moduleType = String(context.moduleType || modulo?.tipo || "").trim();
    return authFetchJson("/api/moodle/module-graphics/generate-element", {
        method: "POST",
        body: {
            courseId,
            moduleId,
            moduleName,
            moduleType,
            languageCode: "es",
            instructions: String(modulo?.instrucciones || "").trim(),
            content: String(modulo?.contenido || "").trim(),
            elementId: String(anchor?.id || "").trim(),
            elementLabel: String(anchor?.label || "").trim(),
            elementPrompt: String(prompt || "").trim(),
            previousStoragePath: String(previousStoragePath || "").trim(),
            regenerate: !!previousStoragePath
        }
    });
}

async function analizarElementoGraficoCapa({ modal, anchor, prompt, imageUrl }) {
    const context = modal?.__graphicContext || {};
    return authFetchJson("/api/moodle/module-graphics/analyze-element", {
        method: "POST",
        body: {
            moduleName: String(context.moduleName || "").trim(),
            moduleType: String(context.moduleType || "").trim(),
            elementLabel: String(anchor?.label || "").trim(),
            elementPrompt: String(prompt || "").trim(),
            imageUrl: String(imageUrl || "").trim()
        }
    });
}

async function generarCapaExtraGrafica(modal, extraLayer = {}) {
    const context = modal?.__graphicContext || {};
    const courseId = String(context.courseId || "").trim();
    const moduleId = String(context.moduleId || "").trim();
    if (!courseId || !moduleId) {
        throw new Error("Falta el contexto del módulo para generar la capa extra.");
    }
    const modulo = await obtenerModulo(moduleId, courseId);
    if (!modulo) {
        throw new Error("No se encontró el módulo para generar la capa extra.");
    }
    const prompt = String(extraLayer?.prompt || extraLayer?.label || "Elemento adicional").trim();
    const response = await authFetchJson("/api/moodle/module-graphics/generate-element", {
        method: "POST",
        body: {
            courseId,
            moduleId,
            moduleName: String(context.moduleName || modulo?.nombre || "").trim(),
            moduleType: String(context.moduleType || modulo?.tipo || "").trim(),
            languageCode: "es",
            instructions: String(modulo?.instrucciones || "").trim(),
            content: String(modulo?.contenido || "").trim(),
            elementId: String(extraLayer?.id || "").trim(),
            elementLabel: String(extraLayer?.label || "Capa extra").trim(),
            elementPrompt: prompt,
            previousStoragePath: String(extraLayer?.storagePath || "").trim(),
            regenerate: !!String(extraLayer?.storagePath || "").trim()
        }
    });
    const image = response?.image && typeof response.image === "object" ? response.image : null;
    if (!image?.downloadUrl) {
        throw new Error("No se pudo generar una imagen utilizable para la capa extra.");
    }
    extraLayer.prompt = prompt;
    extraLayer.imageUrl = String(image.downloadUrl || "").trim();
    extraLayer.maskedImageUrl = "";
    extraLayer.storagePath = String(image.storagePath || "").trim();
    extraLayer.mimeType = String(image.mimeType || "image/png").trim() || "image/png";
    extraLayer.model = String(image.model || "").trim();
    extraLayer.placed = false;
    extraLayer.manualPosition = null;
    extraLayer.maskSelection = null;
    extraLayer.maskInvert = false;
    const analysisResponse = await analizarElementoGraficoCapa({
        modal,
        anchor: { label: String(extraLayer?.label || "Capa extra").trim() },
        prompt,
        imageUrl: extraLayer.imageUrl
    }).catch(() => null);
    extraLayer.validation = analysisResponse?.analysis && typeof analysisResponse.analysis === "object"
        ? analysisResponse.analysis
        : null;
    if (extraLayer.validation?.recommendation === "regenerate" || Number(extraLayer.validation?.score || 0) < 62) {
        const retryResponse = await authFetchJson("/api/moodle/module-graphics/generate-element", {
            method: "POST",
            body: {
                courseId,
                moduleId,
                moduleName: String(context.moduleName || modulo?.nombre || "").trim(),
                moduleType: String(context.moduleType || modulo?.tipo || "").trim(),
                languageCode: "es",
                instructions: String(modulo?.instrucciones || "").trim(),
                content: String(modulo?.contenido || "").trim(),
                elementId: String(extraLayer?.id || "").trim(),
                elementLabel: String(extraLayer?.label || "Capa extra").trim(),
                elementPrompt: `${prompt}\nRegenera esta capa como una sola imagen limpia sobre fondo blanco uniforme, sin texto incrustado, sin numeros, sin patron checkerboard, sin UI, sin collage y sin mezclar multiples capas en la misma imagen.`,
                previousStoragePath: String(extraLayer?.storagePath || "").trim(),
                regenerate: true
            }
        });
        const retryImage = retryResponse?.image && typeof retryResponse.image === "object" ? retryResponse.image : null;
        if (retryImage?.downloadUrl) {
            extraLayer.imageUrl = String(retryImage.downloadUrl || "").trim();
            extraLayer.storagePath = String(retryImage.storagePath || "").trim();
            extraLayer.mimeType = String(retryImage.mimeType || "image/png").trim() || "image/png";
            extraLayer.model = String(retryImage.model || "").trim();
            const retryAnalysis = await analizarElementoGraficoCapa({
                modal,
                anchor: { label: String(extraLayer?.label || "Capa extra").trim() },
                prompt,
                imageUrl: extraLayer.imageUrl
            }).catch(() => null);
            extraLayer.validation = retryAnalysis?.analysis && typeof retryAnalysis.analysis === "object"
                ? retryAnalysis.analysis
                : {
                    recommendation: "regenerate",
                    score: 0,
                    issues: ["No se pudo validar la capa extra regenerada."]
                };
        }
    }
    modal.__graphicLayers = normalizeEditableGraphicLayers(modal.__graphicLayers || {});
    renderEditableGraphicLayers(modal, modal.__graphicLayers);
    const moduleName = String(context.moduleId || "").trim();
    if (extraLayer.validation?.recommendation === "regenerate") {
        reportEstadoGeneracionModulo(moduleName, "La capa extra se generó, pero requiere corrección antes de exportar.", "warning", false);
    } else {
        reportEstadoGeneracionModulo(moduleName, "La capa extra quedó lista para colocarse manualmente.", "success", false);
    }
}

async function subirComposicionSvgAFirebase({ modal, svgMarkup = "" }) {
    const context = modal?.__graphicContext || {};
    const moduleId = String(context.moduleId || "").trim();
    const courseId = String(context.courseId || "").trim();
    const user = auth.currentUser;
    if (!user?.uid || !moduleId || !courseId) {
        throw new Error("Falta contexto para guardar la composición SVG.");
    }
    const blob = new Blob([String(svgMarkup || "")], { type: "image/svg+xml;charset=utf-8" });
    const path = `images/${user.uid}/moodle-module-graphics/${courseId}/${moduleId}/composite_${Date.now()}.svg`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, blob, {
        contentType: "image/svg+xml",
        customMetadata: {
            origin: "moodleModuleGraphicComposer",
            courseId,
            moduleId
        }
    });
    const downloadUrl = await getDownloadURL(ref);
    return {
        downloadUrl,
        storagePath: path,
        mimeType: "image/svg+xml",
        model: "editor-layered-v1",
        promptVersion: "moodle_graphic_editor_layered_v2",
        updatedAt: new Date().toISOString()
    };
}

function reportEstadoGeneracionModulo(moduleId = "", message = "", tone = "info", spinning = false) {
    if (typeof window.setEstadoGeneracionModulo === "function") {
        window.setEstadoGeneracionModulo(moduleId, message, tone, spinning);
        return;
    }
    if (typeof mostrarNotificacion === "function" && String(message || "").trim()) {
        const normalizedTone = String(tone || "info").trim().toLowerCase();
        const notifyType = (normalizedTone === "error" || normalizedTone === "warning" || normalizedTone === "success")
            ? normalizedTone
            : "info";
        mostrarNotificacion(String(message || "").trim(), notifyType);
    }
}

async function generarComposicionGraficaPorCapas(modal) {
    const context = modal?.__graphicContext || {};
    const moduleId = String(context.moduleId || "").trim();
    const courseId = String(context.courseId || "").trim();
    if (!moduleId || !courseId) {
        throw new Error("Falta el contexto del módulo para generar por capas.");
    }
    const modulo = await obtenerModulo(moduleId, courseId);
    if (!modulo) {
        throw new Error("No se encontró el módulo para generar por capas.");
    }

    const layers = applyGuidedGraphicLayout(modal.__graphicLayers || modulo?.graficoGenerado?.layers || {});
    const anchors = Array.isArray(layers?.graphic?.anchors) ? layers.graphic.anchors : [];
    if (!anchors.length) {
        throw new Error("No hay anchors disponibles para generar elementos del gráfico.");
    }

    const moduloPrompt = String(modal.querySelector('textarea[data-layer-editor="graphic"]')?.value || "").trim();
    const existingElements = Array.isArray(layers.graphic.elements) ? layers.graphic.elements : [];
    const elementsByAnchor = new Map(existingElements.map((item) => [String(item?.anchorId || "").trim(), item]));

    reportEstadoGeneracionModulo(moduleId, "Generando elementos del gráfico por capas...", "info", true);

    const generationTasks = anchors.map(async (anchor) => {
        const anchorId = String(anchor?.id || "").trim();
        const previous = elementsByAnchor.get(anchorId) || null;
        const elementPrompt = buildPromptForGraphicElement(anchor, moduloPrompt, modulo);
        const generated = await generarElementoGraficoCapa({
            modal,
            modulo,
            anchor,
            prompt: elementPrompt,
            previousStoragePath: String(previous?.storagePath || "").trim()
        });
        const image = generated?.image && typeof generated.image === "object" ? generated.image : null;
        if (!image?.downloadUrl) {
            throw new Error(`No se pudo generar el elemento para ${anchor?.label || anchorId}.`);
        }
        return {
            id: `element-${anchorId || Date.now()}`,
            anchorId,
            label: String(anchor?.label || "").trim(),
            prompt: elementPrompt,
            imageUrl: String(image.downloadUrl || "").trim(),
            maskedImageUrl: String(previous?.maskedImageUrl || "").trim(),
            storagePath: String(image.storagePath || "").trim(),
            mimeType: String(image.mimeType || "image/png").trim() || "image/png",
            model: String(image.model || "").trim(),
            manualPosition: previous?.manualPosition && typeof previous.manualPosition === "object" ? previous.manualPosition : null,
            placed: previous?.placed === true,
            maskSelection: previous?.maskSelection && typeof previous.maskSelection === "object" ? previous.maskSelection : null,
            maskTolerance: Number.isFinite(Number(previous?.maskTolerance)) ? Number(previous.maskTolerance) : 26,
            maskInvert: previous?.maskInvert === true,
            validation: null
        };
    });

    const generatedElements = await Promise.all(generationTasks);

    for (const item of generatedElements) {
        const anchor = anchors.find((anchorItem) => String(anchorItem?.id || "").trim() === String(item.anchorId || "").trim()) || {};
        const analysisResponse = await analizarElementoGraficoCapa({
            modal,
            anchor,
            prompt: item.prompt,
            imageUrl: item.imageUrl
        }).catch(() => null);
        const analysis = analysisResponse?.analysis && typeof analysisResponse.analysis === "object" ? analysisResponse.analysis : null;
        item.validation = analysis || null;
        if (analysis?.recommendation === "regenerate" || (Number(analysis?.score || 0) < 62)) {
            const regenerated = await generarElementoGraficoCapa({
                modal,
                modulo,
                anchor,
                prompt: `${item.prompt}\nRegenera esta capa como una sola imagen limpia sobre fondo blanco uniforme, sin texto incrustado, sin numeros, sin patron checkerboard, sin canvas visible, sin UI y sin collage.`,
                previousStoragePath: item.storagePath
            });
            const image = regenerated?.image && typeof regenerated.image === "object" ? regenerated.image : null;
            if (image?.downloadUrl) {
                item.imageUrl = String(image.downloadUrl || "").trim();
                item.maskedImageUrl = "";
                item.maskSelection = null;
                item.storagePath = String(image.storagePath || "").trim();
                item.mimeType = String(image.mimeType || "image/png").trim() || "image/png";
                item.model = String(image.model || "").trim();
                const secondAnalysisResponse = await analizarElementoGraficoCapa({
                    modal,
                    anchor,
                    prompt: item.prompt,
                    imageUrl: item.imageUrl
                }).catch(() => null);
                item.validation = secondAnalysisResponse?.analysis && typeof secondAnalysisResponse.analysis === "object"
                    ? secondAnalysisResponse.analysis
                    : {
                        recommendation: "regenerate",
                        score: 0,
                        issues: ["No se pudo validar el asset regenerado."]
                    };
            }
        }
    }

    layers.graphic.elements = generatedElements;
    modal.__graphicLayers = layers;
    renderEditableGraphicLayers(modal, layers);
    const invalidElements = generatedElements.filter((item) => item?.validation?.recommendation === "regenerate");
    if (invalidElements.length) {
        reportEstadoGeneracionModulo(moduleId, "Hay elementos inválidos. Corrígelos desde la sección Elementos.", "warning", false);
        throw new Error("La composición no se puede exportar mientras existan elementos inválidos.");
    }
    const unplacedElements = generatedElements.filter((item) => !(item?.placed === true || (item?.manualPosition && typeof item.manualPosition === "object")));
    if (unplacedElements.length) {
        reportEstadoGeneracionModulo(moduleId, "Las capas se generaron por separado. Colócalas manualmente antes de componer.", "info", false);
        return;
    }
    const stage = modal.querySelector(".cb-module-graphic-lightbox__stage");
    stage?.classList.remove("is-hidden-graphic", "is-hidden-text", "is-hidden-background");
    requestAnimationFrame(() => updateGraphicConnectorLayout(modal));

    const imageNode = modal.querySelector(".cb-module-graphic-lightbox__image");
    if (imageNode) {
        imageNode.removeAttribute("src");
    }
    const svgMarkup = await buildGraphicSvgMarkup(modal);
    const composedImage = await subirComposicionSvgAFirebase({ modal, svgMarkup });
    if (imageNode) {
        imageNode.src = String(composedImage.downloadUrl || "").trim();
    }
    await persistRegeneratedModuleGraphic({ modal, image: composedImage, layers });
    reportEstadoGeneracionModulo(moduleId, "Composición por capas generada y guardada.", "success", false);
}

function parseJsonObjectFromText(raw = "") {
    const clean = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
}

function clampLayerWords(value = "", maxWords = 8, maxChars = 80) {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.split(" ").slice(0, Math.max(1, maxWords)).join(" ").slice(0, Math.max(1, maxChars)).trim();
}

function normalizeRegeneratedTextLayer(payload = {}, fallbackTitle = "") {
    const textLayer = payload?.textLayer && typeof payload.textLayer === "object" ? payload.textLayer : {};
    const labels = Array.isArray(textLayer.labels) ? textLayer.labels : [];
    const legend = Array.isArray(textLayer.legend) ? textLayer.legend : [];
    const normalizedLabels = labels.map((item, index) => ({
        id: String(item?.id || `label-${index + 1}`),
        text: clampLayerWords(String(item?.text || item || "").trim(), 4, 32),
        anchorId: String(item?.anchorId || "").trim(),
        position: sanitizeLayerPositionName(String(item?.position || "").trim(), ["top-left", "top-right", "middle-right", "bottom-left"][index] || "bottom-right")
    })).filter((item) => item.text).slice(0, 4);
    return {
        title: clampLayerWords(String(textLayer.title || fallbackTitle || "").trim(), 4, 34),
        subtitle: clampLayerWords(String(textLayer.subtitle || "").trim(), 6, 46),
        labels: normalizedLabels,
        legend: legend.map((item) => clampLayerWords(String(item || "").trim(), 6, 52)).filter(Boolean).slice(0, 3),
        connectors: (Array.isArray(textLayer.connectors) && textLayer.connectors.length ? textLayer.connectors : normalizedLabels.map((item, index) => ({
            id: `connector-${index + 1}`,
            labelId: item.id,
            anchorId: item.anchorId,
            style: "arrow"
        }))).slice(0, 4).map((item, index) => ({
            id: String(item?.id || `connector-${index + 1}`),
            labelId: String(item?.labelId || normalizedLabels[index]?.id || `label-${index + 1}`),
            anchorId: String(item?.anchorId || normalizedLabels[index]?.anchorId || "").trim(),
            style: String(item?.style || "arrow").trim() || "arrow"
        })),
        titlePosition: sanitizeLayerPositionName(String(textLayer.titlePosition || "").trim(), "top-left"),
        subtitlePosition: sanitizeLayerPositionName(String(textLayer.subtitlePosition || "").trim(), "top-left"),
        legendPosition: sanitizeLayerPositionName(String(textLayer.legendPosition || "").trim(), "bottom-right")
    };
}

function repackTextLayerPositions(textLayer = {}) {
    const next = { ...(textLayer || {}) };
    const baseOrder = ["top-left", "top-right", "middle-right", "bottom-left"];
    next.labels = (Array.isArray(next.labels) ? next.labels : []).map((item, index) => ({
        ...item,
        position: baseOrder[index] || "center"
    }));
    next.connectors = (Array.isArray(next.connectors) ? next.connectors : []).map((item, index) => ({
        ...item,
        labelId: String(item?.labelId || next.labels[index]?.id || `label-${index + 1}`),
        anchorId: String(item?.anchorId || next.labels[index]?.anchorId || "").trim()
    }));
    return next;
}

async function regenerateTextLayerMetadata(modal, prompt = "") {
    const context = modal?.__graphicContext || {};
    const moduleId = String(context.moduleId || "").trim();
    const courseId = String(context.courseId || "").trim();
    if (!moduleId || !courseId) {
        throw new Error("Falta el contexto del módulo para regenerar la capa de texto.");
    }
    const modulo = await obtenerModulo(moduleId, courseId);
    if (!modulo) {
        throw new Error("No se encontró el módulo para regenerar la capa de texto.");
    }
    const currentLayout = JSON.stringify(modal?.__graphicLayers?.textLayer || {});
    const currentAnchors = JSON.stringify(modal?.__graphicLayers?.graphic?.anchors || []);
    const requestPrompt = `
Devuelve solo JSON valido para regenerar la capa 3 de texto de un grafico educativo.

MODULO: ${String(context.moduleName || modulo.nombre || "Modulo").trim()}
TIPO: ${String(context.moduleType || modulo.tipo || "Modulo").trim()}
INSTRUCCIONES: ${String(modulo.instrucciones || "").replace(/\s+/g, " ").trim().slice(0, 1600)}
CONTENIDO: ${String(modulo.contenido || "").replace(/\s+/g, " ").trim().slice(0, 2200)}
AJUSTE DEL USUARIO: ${String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 600)}
LAYOUT ACTUAL: ${currentLayout.slice(0, 1000)}

REGLAS:
- Muy poco texto.
- Titulo maximo 4 palabras.
- Subtitulo maximo 6 palabras.
- Maximo 4 labels, cada uno maximo 4 palabras.
- Maximo 3 bullets de leyenda, cada uno maximo 6 palabras.
- Ubica inteligentemente cada texto donde mejor acompañe al grafico.
- Cada label debe apuntar a un anchor de la lista.
- Devuelve conectores label-anchor.
- Si regeneras, cambia posiciones y redaccion respecto al layout actual.
- No generes parrafos.
- No markdown.

ANCHORS DISPONIBLES: ${currentAnchors.slice(0, 1200)}

JSON:
{
  "textLayer": {
    "title": "string",
    "subtitle": "string",
    "titlePosition": "top-left",
    "subtitlePosition": "top-left",
    "legendPosition": "bottom-right",
    "legend": ["string", "string"],
    "labels": [
      { "id": "string", "text": "string", "anchorId": "string", "position": "top-left|top-center|top-right|middle-left|center|middle-right|bottom-left|bottom-center|bottom-right" }
    ],
    "connectors": [
      { "id": "string", "labelId": "string", "anchorId": "string", "style": "arrow" }
    ]
  }
}
`.trim();
    const response = await authFetchJson("/api/gemini/generate", {
        method: "POST",
        body: {
            model: "gemini-2.5-flash-lite",
            payload: {
                contents: [{ parts: [{ text: requestPrompt }] }],
                generationConfig: { temperature: 0.5 }
            }
        }
    });
    const text = String(response?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    return repackTextLayerPositions(
        normalizeRegeneratedTextLayer(parseJsonObjectFromText(text), String(context.moduleName || modulo.nombre || "").trim())
    );
}

function ensureGraphicLightboxDrag(modal) {
    if (!modal || modal.dataset.dragReady === "1") return;
    modal.dataset.dragReady = "1";
    const state = { target: null, stage: null, offsetX: 0, offsetY: 0, pointerId: null, startX: 0, startY: 0, dragMoved: false };

    modal.addEventListener("pointerdown", (event) => {
        if (typeof event.button === "number" && event.button !== 0) return;
        const handle = event.target.closest(".cb-module-graphic-lightbox__draggable");
        const stage = modal.querySelector(".cb-module-graphic-lightbox__stage");
        if (!handle || !stage) return;
        const stageRect = stage.getBoundingClientRect();
        const handleRect = handle.getBoundingClientRect();
        state.target = handle;
        state.stage = stage;
        state.pointerId = event.pointerId;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.dragMoved = false;
        state.offsetX = event.clientX - handleRect.left;
        state.offsetY = event.clientY - handleRect.top;
        handle.setPointerCapture?.(event.pointerId);
        handle.classList.add("is-dragging");
        event.preventDefault();
        if (stageRect.width <= 0 || stageRect.height <= 0) return;
    });

    modal.addEventListener("pointermove", (event) => {
        if (!state.target || !state.stage) return;
        if (state.pointerId !== null && event.pointerId !== state.pointerId) return;
        const stageRect = state.stage.getBoundingClientRect();
        const targetRect = state.target.getBoundingClientRect();
        if (!state.dragMoved) {
            const deltaX = Math.abs(event.clientX - state.startX);
            const deltaY = Math.abs(event.clientY - state.startY);
            if (deltaX > 3 || deltaY > 3) state.dragMoved = true;
        }
        const nextLeft = ((event.clientX - stageRect.left - state.offsetX) / stageRect.width) * 100;
        const nextTop = ((event.clientY - stageRect.top - state.offsetY) / stageRect.height) * 100;
        const maxLeft = 100 - ((targetRect.width / stageRect.width) * 100);
        const maxTop = 100 - ((targetRect.height / stageRect.height) * 100);
        state.target.style.left = `${clampPercent(nextLeft, 0, maxLeft)}%`;
        state.target.style.top = `${clampPercent(nextTop, 0, maxTop)}%`;
        updateGraphicConnectorLayout(modal);
    });

    const release = () => {
        if (!state.target) return;
        syncDraggedGraphicLayerState(modal, state.target);
        updateGraphicConnectorLayout(modal);
        state.target.classList.remove("is-dragging");
        if (state.dragMoved) {
            modal.dataset.suppressDragClickUntil = String(Date.now() + 250);
        }
        state.target = null;
        state.stage = null;
        state.pointerId = null;
        state.dragMoved = false;
    };

    modal.addEventListener("pointerup", release);
    modal.addEventListener("pointercancel", release);
}

window.abrirGaleriaGraficoModulo = function(sourceOrSrc = "", alt = "", layersRaw = "") {
    const sourceEl = sourceOrSrc && typeof sourceOrSrc === "object" && sourceOrSrc.nodeType === 1 ? sourceOrSrc : null;
    const figureEl = sourceEl?.closest?.(".cb-module-generated-graphic") || null;
    const fallbackImg = sourceEl?.matches?.("img") ? sourceEl : figureEl?.querySelector?.("img");
    const cleanSrc = String(
        fallbackImg?.dataset?.mcImageSrc ||
        fallbackImg?.getAttribute?.("src") ||
        sourceEl?.dataset?.mcImageSrc ||
        sourceOrSrc ||
        ""
    ).trim();
    if (!cleanSrc) return;
    moduleGraphicLightboxLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : sourceEl;
    const cleanAlt = String(
        fallbackImg?.dataset?.mcImageAlt ||
        fallbackImg?.getAttribute?.("alt") ||
        sourceEl?.dataset?.mcImageAlt ||
        alt ||
        ""
    ).trim();
    const layers = applyGuidedGraphicLayout(
        decodeGraphicLayers(String(
            fallbackImg?.dataset?.mcImageLayers ||
            sourceEl?.dataset?.mcImageLayers ||
            layersRaw ||
            ""
        ).trim()) || {}
    );
    const inferred = inferGraphicContextFromNode(sourceEl);
    const modal = ensureModuleGraphicLightbox();
    const image = modal.querySelector(".cb-module-graphic-lightbox__image");
    const caption = modal.querySelector(".cb-module-graphic-lightbox__caption");
    const backgroundLayer = modal.querySelector(".cb-module-graphic-lightbox__background-layer");
    const simplePreviewBackgroundLayer = modal.querySelector(".cb-module-graphic-lightbox__simple-preview-background-layer");
    const simplePreviewTextLayer = modal.querySelector(".cb-module-graphic-lightbox__simple-preview-text-layer");
    const statusText = modal.querySelector(".cb-module-graphic-lightbox__stage-status-text");
    modal.__graphicLayers = layers;
    applySimplePreviewStateFromLayers(modal, layers);
    modal.__graphicContext = {
        moduleId: String(sourceEl?.dataset?.mcModuloId || fallbackImg?.dataset?.mcModuloId || inferred.moduleId || "").trim(),
        courseId: String(sourceEl?.dataset?.mcCourseId || fallbackImg?.dataset?.mcCourseId || inferred.courseId || "").trim(),
        moduleName: String(sourceEl?.dataset?.mcModuleName || fallbackImg?.dataset?.mcModuleName || inferred.moduleName || "").trim(),
        moduleType: String(sourceEl?.dataset?.mcModuleType || fallbackImg?.dataset?.mcModuleType || inferred.moduleType || "").trim()
    };
    ensureGraphicLightboxDrag(modal);
    setGraphicLightboxZoom(modal, 1);
    setGraphicLightboxMode(modal, "preview");
    setGraphicLightboxSection(modal, "composition");
    modal.classList.add("is-simple-preview");
    renderCanvasMeta(modal);
    renderLayerStack(modal, layers);
    modal.querySelectorAll("[data-layer-toggle]").forEach((input) => {
        input.checked = true;
    });
    modal.querySelector(".cb-module-graphic-lightbox__stage")?.classList.remove("is-hidden-background", "is-hidden-graphic", "is-hidden-text");
    if (image) {
        image.src = cleanSrc;
        image.alt = cleanAlt || "Gráfico del módulo";
    }
    if (caption) {
        caption.textContent = cleanAlt || "Gráfico del módulo";
    }
    if (statusText) {
        statusText.textContent = "Gráfico final";
    }
    if (backgroundLayer) {
        backgroundLayer.innerHTML = "";
    }
    if (simplePreviewBackgroundLayer) {
        simplePreviewBackgroundLayer.innerHTML = "";
    }
    if (simplePreviewTextLayer) {
        simplePreviewTextLayer.innerHTML = "";
    }
    setGraphicBackground(modal, layers?.background || {});
    renderGraphicLayerSummaries(modal, layers);
    renderGraphicItemsLayer(modal, layers?.graphic || {});
    renderCustomGraphicLayers(modal, layers);
    renderGraphicTextLayer(modal, layers?.textLayer || {});
    renderGraphicSelectionPanel(modal, layers);
    renderGraphicExportPanel(modal, layers);
    renderSimplePreviewBackground(modal);
    renderSimplePreviewText(modal);
    renderSimplePreviewFooter(modal);
    setGraphicLightboxSection(modal, "composition");
    setGraphicLightboxMode(modal, "preview");
    modal.inert = false;
    modal.removeAttribute("inert");
    modal.setAttribute("aria-hidden", "false");
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    modal.querySelector(".cb-module-graphic-lightbox__close")?.focus?.({ preventScroll: true });
    document.body.classList.add("cb-module-graphic-lightbox-open");
};

function renderEditableGraphicLayers(modal, layers = {}) {
    renderCanvasMeta(modal);
    setGraphicBackground(modal, layers?.background || {});
    renderLayerStack(modal, layers);
    renderGraphicLayerSummaries(modal, layers);
    renderGraphicSelectionPanel(modal, layers);
    renderGraphicExportPanel(modal, layers);
    renderGraphicItemsLayer(modal, layers.graphic || {});
    renderCustomGraphicLayers(modal, layers);
    renderGraphicTextLayer(modal, layers.textLayer || {});
    setGraphicLightboxSection(modal, getGraphicLightboxSection(modal));
    setGraphicLightboxMode(modal, getGraphicLightboxMode(modal));
    requestAnimationFrame(() => updateGraphicConnectorLayout(modal));
}

window.cerrarGaleriaGraficoModulo = function() {
    const modal = document.getElementById(MODULE_GRAPHIC_LIGHTBOX_ID);
    if (!modal) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && modal.contains(activeElement)) {
        const focusTarget = moduleGraphicLightboxLastFocus instanceof HTMLElement && document.contains(moduleGraphicLightboxLastFocus)
            ? moduleGraphicLightboxLastFocus
            : null;
        activeElement.blur();
        focusTarget?.focus?.({ preventScroll: true });
    }
    const image = modal.querySelector(".cb-module-graphic-lightbox__image");
    if (image) {
        image.removeAttribute("src");
        image.removeAttribute("alt");
    }
    modal.classList.add("hidden");
    modal.classList.remove("is-open");
    modal.inert = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cb-module-graphic-lightbox-open");
};

document.addEventListener("click", (event) => {
    const graphicTrigger = event.target.closest(".cb-module-generated-graphic__image, .cb-module-generated-graphic__open");
    if (graphicTrigger) {
        window.abrirGaleriaGraficoModulo?.(graphicTrigger);
        return;
    }

    const actionEl = event.target.closest("[data-mc-action]");
    if (!actionEl) return;

    const action = String(actionEl.dataset.mcAction || "").trim();
    if (!action) return;

    const directHandlers = {
        "insert-table": () => insertTable(),
        "insert-gemini-image": () => insertGeminiImage(),
        "clear-format": () => clearFormat(),
        "paste-plain": () => pasteAsPlainText(),
        "paste-html": () => pasteWithFormat(),
        "cerrar-modal-analisis": () => window.cerrarModalAnalisis?.(),
        "cerrar-modal-traduccion": () => window.cerrarModalTraduccion?.(),
        "cerrar-modal-traducir-subtema": () => window.cerrarModalTraducirSubtema?.(),
        "cerrar-modal-crear-tabla": () => window.cerrarModalCrearTabla?.(),
        "copiar-tabla-preview": () => window.copiarTablaPreview?.(),
        "previsualizar-tabla-modulo": () => window.previsualizarTablaModulo?.(),
        "aplicar-tabla-modulo": () => window.aplicarTablaModulo?.(),
        "cerrar-modal-tono": () => window.cerrarModalTono?.(),
        "cerrar-modal-notas-maestro": () => window.cerrarModalNotasMaestro?.(),
        "regenerar-notas-maestro": () => window.regenerarNotasMaestro?.(),
        "aplicar-notas-maestro": () => window.aplicarNotasMaestro?.(),
        "guardar-notas-maestro": () => window.guardarNotasMaestro?.(),
        "cerrar-modal-instrucciones-subtema": () => document.getElementById("modalInstruccionesSubtema")?.classList.add("hidden"),
        "abrir-modal-notas-maestro": () => window.abrirModalNotasMaestro?.(actionEl.dataset.mcModuloId || ""),
        "analizar-modulo": () => window.analizarModulo?.(actionEl.dataset.mcModuloId || ""),
        "abrir-instrucciones-gemini": () => window.abrirInstruccionesGemini?.(actionEl.dataset.mcModuloId || ""),
        "ejecutar-generacion-modulo-gemini": () => window.ejecutarGeneracionModuloGemini?.(actionEl.dataset.mcModuloId || ""),
        "agregar-actividad-original-modulo": () => window.agregarActividadOriginalAlModulo?.(actionEl.dataset.mcModuloId || ""),
        "toggle-menu-acciones-modulo": () => {
            event.stopPropagation();
            event.stopImmediatePropagation();
            window.toggleMenuAccionesModulo?.(actionEl);
        },
        "abrir-modal-tono": () => window.abrirModalTono?.(actionEl.dataset.mcModuloId || ""),
        "abrir-modal-crear-tabla": () => window.abrirModalCrearTabla?.(actionEl.dataset.mcModuloId || ""),
        "traducir-modulo": () => window.traducirModulo?.(actionEl.dataset.mcModuloId || ""),
        "abrir-galeria-grafico-modulo": () => window.abrirGaleriaGraficoModulo?.(actionEl),
        "cerrar-galeria-grafico-modulo": () => window.cerrarGaleriaGraficoModulo?.(),
        "reintentar-notas-maestro": () => window.regenerarNotasMaestro?.(),
        "abrir-traduccion-subtema": () => window.abrirTraduccionSubtema?.(actionEl.dataset.mcTranslationId || ""),
        "eliminar-traduccion-subtema": () => window.eliminarTraduccionSubtema?.(actionEl.dataset.mcTranslationId || ""),
        "abrir-traduccion": () => window.abrirTraduccion?.(actionEl.dataset.mcTranslationId || "", actionEl.dataset.mcModuloId || ""),
        "aplicar-traduccion": () => window.aplicarTraduccionAlModulo?.(actionEl.dataset.mcTranslationId || "", actionEl.dataset.mcModuloId || ""),
        "eliminar-traduccion": () => window.eliminarTraduccion?.(actionEl.dataset.mcTranslationId || "", actionEl.dataset.mcModuloId || ""),
        "generar-vista-previa-tono": () => window.generarVistaPreviaTono?.(),
    };

    if (action === "eliminar-modulo") {
        event.preventDefault();
        event.stopPropagation();
        const moduloId = actionEl.dataset.mcModuloId || "";
        if (moduloId && window.confirm("¿Eliminar módulo?")) {
            window.eliminarModulo?.(moduloId);
        }
        return;
    }

    if (action === "format-text") {
        event.preventDefault();
        formatText(actionEl.dataset.mcCommand || "");
        return;
    }

    const handler = directHandlers[action];
    if (!handler) return;

    event.preventDefault();
    handler();
});

document.addEventListener("change", (event) => {
    const actionEl = event.target.closest("[data-mc-action='toggle-archivo-modulo']");
    if (!actionEl) return;
    window.toggleArchivoModulo?.(actionEl.dataset.mcModuloId || "", !!actionEl.checked);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        window.cerrarGaleriaGraficoModulo?.();
    }
});

function withTimeout(promise, ms = 30000, message = "La operación tardó demasiado.") {
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
        timerId = window.setTimeout(() => {
            reject(new Error(message));
        }, Math.max(1000, Number(ms) || 30000));
    });
    return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
        if (timerId != null) window.clearTimeout(timerId);
    });
}

function sanitizarHtmlEditorial(value = "") {
    return sanitizeHtml(String(value || "")).trim();
}

function sanitizarHtmlEditorialOMensajeVacio(value = "", emptyHtml = "") {
    const limpio = sanitizarHtmlEditorial(value);
    return limpio || emptyHtml;
}

function construirDocIdModulo(moduloId, cursoIdRef = null) {
    const cursoId = cursoIdRef || (curso ? curso.id : null);
    if (!moduloId || !cursoId) return null;
    return moduloId.includes('_') ? moduloId : `${cursoId}_${moduloId}`;
}

function extraerIdInternoModulo(moduloId, cursoIdRef = null) {
    const raw = String(moduloId || "").trim();
    if (!raw) return "";
    const cursoId = String(cursoIdRef || curso?.id || "").trim();
    const prefijo = cursoId ? `${cursoId}_` : "";
    if (prefijo && raw.startsWith(prefijo)) {
        return raw.slice(prefijo.length);
    }
    return raw;
}

function actualizarBotonToggleArchivados() {
    const btn = document.getElementById("btnToggleArchivados");
    if (!btn) return;
    btn.classList.toggle("archivados-visibles", !!mostrarModulosArchivados);
    btn.classList.toggle("archivados-ocultos", !mostrarModulosArchivados);
    btn.title = mostrarModulosArchivados ? "Archivados visibles" : "Archivados ocultos";
    btn.setAttribute("aria-label", btn.title);
}

function inicializarToggleArchivadosUI() {
    const btn = document.getElementById("btnToggleArchivados");
    if (!btn || btn.dataset.cbBound === "1") return;

    btn.addEventListener("click", () => {
        mostrarModulosArchivados = !mostrarModulosArchivados;
        localStorage.setItem("cb_mostrar_modulos_archivados", mostrarModulosArchivados ? "1" : "0");
        actualizarBotonToggleArchivados();

        if (subtemaActivo) {
            cargarSubtema(subtemaActivo);
        }
        renderTemas();
    });

    btn.dataset.cbBound = "1";
    actualizarBotonToggleArchivados();
}

function inicializarBotonExportCursoWord() {
    const btn = document.getElementById("btnExportCursoWord");
    if (!btn || btn.dataset.cbBound === "1") return;

    btn.addEventListener("click", async () => {
        if (!curso) {
            alert("Selecciona un curso para exportar.");
            return;
        }

        btn.disabled = true;
        btn.classList.add("opacity-50", "cursor-wait");

        try {
            await exportarCursoCompletoWord(curso, { incluirArchivados: mostrarModulosArchivados });
        } catch (_) {
            alert("Error exportando el curso a Word");
        } finally {
            btn.classList.remove("cursor-wait");
            btn.classList.toggle("opacity-50", !curso);
            btn.classList.toggle("cursor-not-allowed", !curso);
            btn.disabled = !curso;
        }
    });

    btn.dataset.cbBound = "1";
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarToggleArchivadosUI);
    document.addEventListener("DOMContentLoaded", inicializarBotonExportCursoWord);
} else {
    inicializarToggleArchivadosUI();
    inicializarBotonExportCursoWord();
}

/* ESPERAR A QUE EL USUARIO INICIE SESIÓN */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Debes iniciar sesión.");
    return;
  }

  currentUserId = user.uid;
  window.currentUserId = user.uid;
  currentUserRole = "user";

  await syncGeminiModelOptionsForMoodle();
  await cargarCursosUsuario();

  const cursoIdGuardado = localStorage.getItem("cursoSeleccionado");
  if (cursoIdGuardado) {
    const cursoGuardadoExiste = cursosUsuario.some(c => c.id === cursoIdGuardado);
    if (cursoGuardadoExiste) {
      await seleccionarCurso(cursoIdGuardado);
    } else {
      localStorage.removeItem("cursoSeleccionado");
      localStorage.removeItem("temaAbierto");
      localStorage.removeItem("subtemaAbierto");
      localStorage.removeItem("moduloActivo");
    }
  }
  
  // 🔥 CORRECCIÓN: NO abrir automáticamente el modal
  // En lugar de eso, puedes mostrar un mensaje o botón para crear el primer curso
  if (cursosUsuario.length === 0) {
    // OPCIONAL: Mostrar un mensaje amigable en la lista de cursos
    listaCursos.innerHTML = `
      <li class="p-4 text-center">
        <p class="text-sm text-gray-600 mb-3">No tienes cursos aún</p>
        <button id="btnPrimerCurso" 
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
          Crear mi primer curso
        </button>
      </li>
    `;
    
    // Agregar evento al botón personalizado
    document.getElementById("btnPrimerCurso")?.addEventListener("click", () => {
      document.getElementById("btnNuevoCurso").click();
    });
  }
});


async function cargarCursosUsuario() {
    try {
        
        if (!currentUserId) {
            cursosUsuario = [];
            renderListaCursos();
            return;
        }
        
        // 🔥 SOLUCIÓN: Buscar cursos propios y compartidos en PARALELO pero con filtro correcto
        const qPropios = query(
            collection(db, "moodleCourses"),
            where("userId", "==", currentUserId)
        );
        
        const qCompartidos = query(
            collection(db, "moodleCourses"),
            where("compartidoCon", "array-contains", currentUserId)
        );
        
        // Ejecutar ambas consultas en paralelo
        const [snapPropios, snapCompartidos] = await Promise.all([
            getDocs(qPropios),
            getDocs(qCompartidos)
        ]);
        
        // 🔥 USAR MAP PARA EVITAR DUPLICADOS
        const cursosMap = new Map();
        
        const esDocumentoCursoRaiz = (docId, data = {}) => {
            const cleanDocId = String(docId || "").trim();
            const cleanCursoId = String(data?.cursoId || "").trim();
            const docType = String(data?.docType || "").trim().toLowerCase();
            if (docType === "module") return false;
            if (docType === "course") return true;
            if (cleanCursoId && cleanCursoId !== cleanDocId) return false;
            if (cleanDocId.includes("_")) return false;
            return Array.isArray(data?.temas);
        };

        // 1. Procesar cursos propios (userId === currentUserId)
        snapPropios.docs.forEach(d => {
            const data = d.data();
            const cursoId = d.id;
            if (!esDocumentoCursoRaiz(cursoId, data)) {
                return;
            }
            
            const curso = {
                id: cursoId,
                nombre: data.nombre || "Sin nombre",
                descripcion: data.descripcion || "",
                userId: data.userId,
                cursoId: data.cursoId || cursoId,
                creado: data.creado || new Date(),
                temas: data.temas || [],
                esPropio: true,
                permisos: {
                    editar: true,
                    compartir: true,
                    eliminar: true
                },
                tipo: "propio",
                compartidoCon: data.compartidoCon || [],
                compartidoConDetalles: data.compartidoConDetalles || []
            };
            
            cursosMap.set(cursoId, curso);
        });
        
        // 2. Procesar cursos compartidos donde el usuario NO es propietario
        snapCompartidos.docs.forEach(d => {
            const data = d.data();
            const cursoId = d.id;
            if (!esDocumentoCursoRaiz(cursoId, data)) {
                return;
            }
            
            // 🔥 VERIFICACIÓN CRÍTICA: Si ya está en el mapa (es curso propio), IGNORAR
            if (cursosMap.has(cursoId)) {
                return;
            }
            
            // Verificar que el usuario NO sea el propietario
            if (data.userId === currentUserId) {
                return;
            }
            
            // Obtener permisos específicos para este usuario
            let permisosUsuario = { editar: false, compartir: false, eliminar: false };
            let propietarioNombre = "Usuario Desconocido";
            let propietarioId = data.userId;
            
            if (data.compartidoConDetalles && Array.isArray(data.compartidoConDetalles)) {
                permisosUsuario = resolveMoodleCollabPermissions(data, currentUserId);

                // Obtener nombre del propietario
                const propietarioDetalle = data.compartidoConDetalles.find(
                    detalle => detalle.userId === propietarioId
                );
                if (propietarioDetalle && propietarioDetalle.userName) {
                    propietarioNombre = propietarioDetalle.userName;
                }
            }
            
            const curso = {
                id: cursoId,
                nombre: data.nombre || "Curso compartido",
                descripcion: data.descripcion || "",
                userId: data.userId,
                cursoId: data.cursoId || cursoId,
                creado: data.creado || new Date(),
                temas: data.temas || [],
                esPropio: false,
                permisos: permisosUsuario,
                propietarioNombre: propietarioNombre,
                propietarioId: propietarioId,
                tipo: "compartido",
                fechaCompartido: data.actualizado || new Date(),
                acceso: permisosUsuario.editar ? "editable" : "lectura",
                compartidoCon: data.compartidoCon || [],
                compartidoConDetalles: data.compartidoConDetalles || []
            };
            
            cursosMap.set(cursoId, curso);
        });
        
        // Convertir Map a array
        cursosUsuario = Array.from(cursosMap.values());
        
        
        // Ordenar: primero propios, luego compartidos, luego por fecha
        cursosUsuario.sort((a, b) => {
            // Primero propios vs compartidos
            if (a.esPropio && !b.esPropio) return -1;
            if (!a.esPropio && b.esPropio) return 1;
            
            // Luego por fecha (más reciente primero)
            const fechaA = a.creado?.toDate ? a.creado.toDate() : new Date(a.creado || Date.now());
            const fechaB = b.creado?.toDate ? b.creado.toDate() : new Date(b.creado || Date.now());
            return fechaB - fechaA;
        });
        
        renderListaCursos();
        
    } catch (err) {
        mostrarNotificacion("Error al cargar los cursos", 'error');
        cursosUsuario = [];
        renderListaCursos();
    }
}


function renderListaCursos() {
    // Limpiar completamente la lista antes de renderizar
    listaCursos.innerHTML = "";
    
    // Verificar si hay cursos para mostrar
    if (!cursosUsuario || cursosUsuario.length === 0) {
        listaCursos.innerHTML = `
            <li class="p-3 text-xs text-gray-500 italic text-center">
                No hay cursos creados
            </li>
        `;
        return;
    }
    
    // Separar cursos propios y compartidos
    const cursosPropios = cursosUsuario.filter(c => c.esPropio);
    const cursosCompartidos = cursosUsuario.filter(c => !c.esPropio);
    
    // Ordenar por fecha (más recientes primero)
    const ordenarPorFecha = (a, b) => {
        const fechaA = a.creado?.toDate ? a.creado.toDate() : new Date(a.creado || Date.now());
        const fechaB = b.creado?.toDate ? b.creado.toDate() : new Date(b.creado || Date.now());
        return fechaB - fechaA;
    };
    
    cursosPropios.sort(ordenarPorFecha);
    cursosCompartidos.sort(ordenarPorFecha);
    
    // Renderizar cursos propios
    if (cursosPropios.length > 0) {
        const tituloPropios = document.createElement("div");
        tituloPropios.className = "px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1";
        tituloPropios.textContent = "Mis Cursos";
        listaCursos.appendChild(tituloPropios);
        
        cursosPropios.forEach(cursoItem => {
            renderCursoItem(cursoItem);
        });
    }
    
    // Renderizar cursos compartidos
    if (cursosCompartidos.length > 0) {
        const tituloCompartidos = document.createElement("div");
        tituloCompartidos.className = "px-2 py-1 mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-t border-border";
        tituloCompartidos.textContent = "Compartidos Conmigo";
        listaCursos.appendChild(tituloCompartidos);
        
        cursosCompartidos.forEach(cursoItem => {
            renderCursoItem(cursoItem);
        });
    }
    
    // Si no hay cursos de ningún tipo
    if (cursosPropios.length === 0 && cursosCompartidos.length === 0) {
        listaCursos.innerHTML = `
            <li class="p-3 text-xs text-muted-foreground italic text-center">
                No hay cursos disponibles
            </li>
        `;
    }
}

function renderCursoItem(cursoItem) {
    const esActivo = cursoDocId === cursoItem.id;
    
    const li = document.createElement("li");
    li.className = `curso-item flex items-center justify-between gap-2 p-2 text-xs rounded cursor-pointer transition-colors duration-200 ${
        esActivo ? 'active highlight-pulse' : ''
    }`;
    li.dataset.id = cursoItem.id;
    li.dataset.tipo = cursoItem.esPropio
        ? "propio"
        : cursoItem.esOtro
        ? "otro"
        : "compartido";

    
    // Determinar ícono y color basado en el tipo de curso
    const icono = cursoItem.esPropio
        ? 'fa-book'
        : cursoItem.esOtro
        ? 'fa-layer-group'
        : 'fa-share-from-square';

    const colorIcono = 'curso-item-icon';

    
    // Determinar qué botones mostrar según permisos
    const botonesPropios = `
        <i class="fas fa-share-alt cursor-pointer cb-action-icon btn-share-curso" 
           title="Compartir curso"></i>
        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-curso" 
           title="Duplicar curso"></i>
        <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-curso" 
           title="Editar nombre del curso"></i>
        <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-curso" 
           title="Eliminar curso"></i>
    `;
    
    const botonesCompartidos = `
        ${cursoItem.permisos?.compartir ? 
        `<i class="fas fa-share-alt cursor-pointer cb-action-icon btn-share-curso" 
            title="Compartir curso"></i>` : ''
        }
        ${cursoItem.permisos?.editar ? 
            `<i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-curso" 
               title="Editar nombre del curso"></i>` : 
            `<i class="fas fa-eye curso-readonly-icon cb-action-icon" title="Solo lectura"></i>`
        }

        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-curso" 
           title="Duplicar curso"></i>
    `;
    
    li.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-w-0">
            <i class="fas ${icono} ${colorIcono} cb-node-icon flex-shrink-0"></i>
            <div class="flex flex-col min-w-0 flex-1">
                <span class="curso-nombre ${esActivo ? 'font-semibold' : ''} truncate" title="${cursoItem.nombre}">
                    ${cursoItem.nombre}
                </span>
                ${!cursoItem.esPropio ? `
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] curso-owner-label truncate" title="Compartido por ${cursoItem.propietarioNombre || 'Usuario'}">
                            <i class="fas fa-user-friends mr-1 cb-node-icon"></i>${cursoItem.propietarioNombre || 'Usuario'}
                        </span>
                        ${cursoItem.permisos?.editar ? 
                            `<span class="text-[9px] curso-pill px-1 rounded">Editable</span>` : 
                            `<span class="text-[9px] curso-pill curso-pill-muted px-1 rounded">Solo lectura</span>`
                        }
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div class="flex items-center gap-1 ml-2 curso-actions flex-shrink-0">
            ${cursoItem.esPropio ? botonesPropios : botonesCompartidos}
        </div>
    `;
    
    // Función para manejar clics en el curso (excepto en los botones de acción)
    li.addEventListener("click", (e) => {
        // Si el clic fue en un botón de acción, no hacer nada
        if (e.target.closest(".btn-edit-curso") || 
            e.target.closest(".btn-delete-curso") || 
            e.target.closest(".btn-duplicate-curso") ||
            e.target.closest(".btn-share-curso")) {
            return;
        }
        
        const sidebarTemas = document.getElementById("sidebarTemas");
        
        // Si ya está seleccionado → colapsar sidebarTemas
        if (cursoDocId === cursoItem.id && !sidebarTemas.classList.contains("hidden")) {
            sidebarTemas.classList.add("hidden");
            // Limpiar estados
            localStorage.removeItem("temaAbierto");
            localStorage.removeItem("subtemaAbierto");
            localStorage.removeItem("moduloActivo");
            cursoDocId = null;
            
            // Actualizar clases activas
            document.querySelectorAll('.curso-item').forEach(item => {
                item.classList.remove('active', 'highlight-pulse');
            });
            return;
        }
        
        // Para cursos compartidos sin permisos de edición, mostrar advertencia
        if (!cursoItem.esPropio && !cursoItem.permisos?.editar) {
            if (!confirm("Este curso está en modo solo lectura. ¿Deseas abrirlo para ver el contenido?")) {
                return;
            }
        }
        
        // Seleccionar curso normalmente
        seleccionarCurso(cursoItem.id);
    });
    
    // Botón compartir (solo para cursos propios)
    const btnShare = li.querySelector(".btn-share-curso");
    if (btnShare) {
        btnShare.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Almacenar referencia al curso que se quiere compartir
            window.cursoCompartiendo = cursosUsuario.find(c => c.id === cursoItem.id);
            if (!window.cursoCompartiendo) return;
            
            // Actualizar el nombre del curso en el modal
            const cursoCompartirNombre = document.getElementById("cursoCompartirNombre");
            if (cursoCompartirNombre) {
                cursoCompartirNombre.textContent = window.cursoCompartiendo.nombre;
            }
            
            // Cargar usuarios para compartir
            if (typeof cargarUsuariosParaCompartirCurso === 'function') {
                cargarUsuariosParaCompartirCurso();
            }
            
            // Resetear checkboxes de permisos
            const checkEditar = document.getElementById("checkPermisoEditar");
            const checkCompartir = document.getElementById("checkPermisoCompartir");
            if (checkEditar) checkEditar.checked = true;
            if (checkCompartir) checkCompartir.checked = true;
            
            // Mostrar el modal
            const modalCompartir = document.getElementById("modalCompartirCurso");
            if (modalCompartir) {
                modalCompartir.classList.remove("hidden");
                modalCompartir.classList.add("flex");
            }
        });
    }
    
    // Botón editar curso
    const btnEdit = li.querySelector(".btn-edit-curso");
    if (btnEdit) {
        btnEdit.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Guardar referencia al curso que se está editando
            cursoEditando = {
                id: cursoItem.id,
                nombre: cursoItem.nombre,
                esPropio: cursoItem.esPropio,
                permisos: cursoItem.permisos
            };
            
            // Para cursos compartidos sin permisos, mostrar mensaje
            if (!cursoItem.esPropio && !cursoItem.permisos?.editar) {
                alert("No tienes permisos para editar este curso. Solo puedes verlo en modo lectura.");
                return;
            }
            
            inputEditarNombreCurso.value = cursoEditando.nombre;
            inputEditarNombreCurso.focus();
            
            modalEditarCurso.classList.remove("hidden");
            modalEditarCurso.classList.add("flex");
        });
    }
    
    // Botón duplicar curso
    const btnDuplicate = li.querySelector(".btn-duplicate-curso");
    if (btnDuplicate) {
        btnDuplicate.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Verificar que el usuario esté autenticado
            if (!currentUserId) {
                alert("Debes iniciar sesión para duplicar cursos.");
                return;
            }
            
            // Buscar el curso a duplicar
            const cursoADuplicar = cursosUsuario.find(c => c.id === cursoItem.id);
            if (!cursoADuplicar) return;
            
            const nombreCurso = cursoADuplicar.nombre || "Curso";
            if (!confirm(`¿Duplicar el curso "${nombreCurso}" completo?`)) return;
            
            try {
                // 1️⃣ Obtener datos COMPLETOS del curso original desde Firebase
                const cursoRef = doc(db, "moodleCourses", cursoItem.id);
                const cursoSnap = await getDoc(cursoRef);
                
                if (!cursoSnap.exists()) {
                    alert("El curso original no existe.");
                    return;
                }
                
                const cursoOriginalData = cursoSnap.data();
                
                // 2️⃣ Generar nuevo ID de curso
                const nuevoId = crypto.randomUUID();
                
                // 3️⃣ Crear copia profunda con nuevos IDs
                const nuevoCurso = {
                    ...cursoOriginalData,
                    id: nuevoId,
                    cursoId: nuevoId,
                    nombre: cursoOriginalData.nombre + " (Copia)",
                    userId: currentUserId,
                    creado: new Date(),
                    actualizado: new Date(),
                    // Limpiar datos de compartir
                    compartidoCon: [],
                    compartidoConDetalles: [],
                    // Marcar como propio y editable
                    esPropio: true,
                    permisos: {
                        editar: true,
                        compartir: true,
                        eliminar: true
                    }
                };
                
                // 4️⃣ Regenerar IDs internos (temas y subtemas)
                if (Array.isArray(nuevoCurso.temas)) {
                    const idMap = new Map(); // Para mapear IDs viejos a nuevos
                    
                    nuevoCurso.temas = nuevoCurso.temas.map(t => {
                        const nuevoTemaId = crypto.randomUUID();
                        const temaViejoId = t.id;
                        
                        idMap.set(temaViejoId, nuevoTemaId);
                        
                        const nuevoTema = { 
                            ...t, 
                            id: nuevoTemaId,
                            subtemas: []
                        };
                        
                        // Regenerar IDs de subtemas
                        if (Array.isArray(t.subtemas)) {
                            nuevoTema.subtemas = t.subtemas.map(st => {
                                const nuevoSubtemaId = crypto.randomUUID();
                                const subtemaViejoId = st.id;
                                
                                idMap.set(subtemaViejoId, nuevoSubtemaId);
                                
                                // Mantener referencia a los módulos
                                const nuevosModulosIds = [...(st.modulosIds || [])];
                                
                                return { 
                                    ...st, 
                                    id: nuevoSubtemaId,
                                    modulosIds: nuevosModulosIds
                                };
                            });
                        }
                        
                        return nuevoTema;
                    });
                }
                
                // 5️⃣ Duplicar TODOS los módulos individualmente con nuevos IDs
                if (nuevoCurso.temas) {
                    for (const tema of nuevoCurso.temas) {
                        if (tema.subtemas) {
                            for (const subtema of tema.subtemas) {
                                if (subtema.modulosIds && Array.isArray(subtema.modulosIds)) {
                                    const nuevosModulosIds = [];
                                    
                                    for (const moduloId of subtema.modulosIds) {
                                        try {
                                            // Construir ID compuesto para buscar el módulo original
                                            const idParaBuscar = moduloId.includes('_') ? 
                                                moduloId : `${cursoItem.id}_${moduloId}`;
                                            
                                            const moduloOriginal = await obtenerModulo(idParaBuscar, cursoItem.id);
                                            
                                            if (moduloOriginal) {
                                                // Generar nuevo ID para el módulo
                                                const nuevoModuloId = crypto.randomUUID();
                                                const idFirestore = `${nuevoId}_${nuevoModuloId}`;
                                                
                                                // Crear copia del módulo con nuevo ID
                                                const nuevoModulo = {
                                                    ...moduloOriginal,
                                                    id: nuevoModuloId,
                                                    cursoId: nuevoId,
                                                    subtemaId: subtema.id,
                                                    creado: new Date(),
                                                    actualizado: new Date(),
                                                    // 🔥 Asegurar que los campos de edición estén limpios
                                                    editable: true,
                                                    // 🔥 Limpiar cualquier referencia de solo lectura
                                                    modoLectura: false
                                                };
                                                
                                                // Guardar el nuevo módulo
                                                await setDoc(doc(db, "moodleCourses", idFirestore), nuevoModulo);
                                                
                                                // Reemplazar ID viejo por nuevo en el subtema
                                                nuevosModulosIds.push(nuevoModuloId);
                                            } else {
                                                // Si no se encuentra el módulo original, mantener el ID
                                                nuevosModulosIds.push(moduloId);
                                            }
                                        } catch (moduloError) {
                                            nuevosModulosIds.push(moduloId); // Mantener ID original como fallback
                                        }
                                    }
                                    
                                    // Actualizar el array de módulos en el subtema
                                    subtema.modulosIds = nuevosModulosIds;
                                }
                            }
                        }
                    }
                }
                
                // 6️⃣ Guardar el curso duplicado en Firebase
                await setDoc(doc(db, "moodleCourses", nuevoId), nuevoCurso);
                
                // 7️⃣ Recargar la lista completa desde Firebase
                await cargarCursosUsuario();
                
                // 8️⃣ Seleccionar el curso duplicado
                setTimeout(() => {
                    seleccionarCurso(nuevoId);
                }, 500);
                
                alert("✅ Curso duplicado exitosamente. Todos los elementos son editables.");
                
            } catch (err) {
                alert("❌ Error al duplicar el curso: " + err.message);
            }
        });
    }


    // Botón eliminar curso (solo para cursos propios)
    const btnDelete = li.querySelector(".btn-delete-curso");
    if (btnDelete) {
        btnDelete.addEventListener("click", async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Para cursos compartidos, no mostrar botón de eliminar
            if (!cursoItem.esPropio) return;
            
            if (!confirm(`¿Eliminar el curso "${cursoItem.nombre}" completo? Esta acción no se puede deshacer.`)) return;
            
            try {
                await authFetchJson("/api/moodle/delete-course", {
                    method: "POST",
                    body: { courseId: cursoItem.id }
                });
                
                // 2. Recargar lista desde Firebase
                await cargarCursosUsuario();
                
                // 3. Si el curso eliminado es el que está seleccionado, limpiar completamente
                if (cursoDocId === cursoItem.id) {
                    // Limpiar todas las variables globales
                    cursoDocId = null;
                    curso = null;
                    temaActivo = null;
                    subtemaActivo = null;
                    
                    // Limpiar localStorage relacionado con el curso
                    localStorage.removeItem("cursoSeleccionado");
                    localStorage.removeItem("temaAbierto");
                    localStorage.removeItem("subtemaAbierto");
                    localStorage.removeItem("moduloActivo");
                    
                    // Ocultar sidebar de temas
                    const sidebarTemas = document.getElementById("sidebarTemas");
                    if (sidebarTemas) sidebarTemas.classList.add("hidden");
                    
                    // Limpiar editor
                    const contenidoEditor = document.getElementById("contenidoEditor");
                    if (contenidoEditor) {
                        contenidoEditor.innerHTML = `
                            <div class="empty-state text-center py-10 text-gray-400">
                                <i class="fas fa-layer-group text-3xl mb-2"></i>
                                <p class="text-sm">Selecciona un curso para comenzar</p>
                            </div>
                        `;
                    }
                    
                    // Limpiar nombre del curso seleccionado
                    const cursoSeleccionadoNombre = document.getElementById("cursoSeleccionadoNombre");
                    if (cursoSeleccionadoNombre) {
                        cursoSeleccionadoNombre.innerText = "Selecciona un curso";
                    }
                    
                    // Deshabilitar botón de añadir tema
                    const btnAddTema = document.getElementById("btnAddTema");
                    if (btnAddTema) {
                        btnAddTema.disabled = true;
                    }

                    const btnExportCursoWord = document.getElementById("btnExportCursoWord");
                    if (btnExportCursoWord) {
                        btnExportCursoWord.disabled = true;
                        btnExportCursoWord.classList.add("opacity-50", "cursor-not-allowed");
                    }
                }
                
                // 4. Si el curso eliminado era el que se estaba editando, limpiar esa referencia
                if (cursoEditando && cursoEditando.id === cursoItem.id) {
                    cursoEditando = null;
                }
                
                // 5. Si quedan cursos, seleccionar el primero automáticamente
                if (cursosUsuario.length > 0) {
                    setTimeout(() => {
                        const primerCurso = cursosUsuario[0];
                        if (primerCurso && primerCurso.id) {
                            seleccionarCurso(primerCurso.id);
                        }
                    }, 300);
                }
                
                alert("✅ Curso eliminado exitosamente.");
                
            } catch (err) {
                alert("❌ Error al eliminar el curso: " + err.message);
                
                // Si hay error, recargar los cursos desde Firebase
                await cargarCursosUsuario();
            }
        });
    }
    
    listaCursos.appendChild(li);
}

function limpiarEstadosActivos() {
    // Remover clases activas
    document.querySelectorAll('.curso-item.active').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.subtema-activo').forEach(item => {
        item.classList.remove('subtema-activo');
    });
    
    document.querySelectorAll('.modulo-activo').forEach(item => {
        item.classList.remove('modulo-activo');
    });
    
    // Limpiar localStorage
    localStorage.removeItem("temaAbierto");
    localStorage.removeItem("subtemaAbierto");
}


const modalCrearCurso = document.getElementById("modalCrearCurso");
const inputNombreCurso = document.getElementById("inputNombreCurso");
const btnCrearCurso = document.getElementById("btnConfirmarCrearCurso");
const btnCancelarCrearCurso = document.getElementById("btnCancelarCrearCurso");





// Función para mostrar/ocultar permisos según modo de compartir
function togglePermisosSegunModo() {
    const modoCopia = document.getElementById('radioCopia').checked;
    const permisosDiv = document.getElementById('permisosColaboracion');
    
    if (modoCopia) {
        permisosDiv.classList.add('hidden');
    } else {
        permisosDiv.classList.remove('hidden');
    }
}

// Conectar eventos a los radios
document.addEventListener('DOMContentLoaded', function() {
    const radios = document.querySelectorAll('input[name="modoCompartir"]');
    radios.forEach(radio => {
        radio.addEventListener('change', togglePermisosSegunModo);
    });
});

// Función principal para compartir curso
// Busca esta función (aproximadamente línea 490):
document.getElementById('btnConfirmarCompartirCurso').addEventListener('click', async function() {
    const curso = window.cursoCompartiendo;
    if (!curso || !window.currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    // Obtener modo de compartir seleccionado
    const modoCopia = document.getElementById('radioCopia').checked;
    const modoColaboracion = document.getElementById('radioColaboracion').checked;
    
    if (!modoCopia && !modoColaboracion) {
        mostrarNotificacion("Selecciona un modo de compartir", "error");
        return;
    }

    // 🔥 CORRECCIÓN: Obtener TODOS los usuarios (nuevos y ya compartidos)
    // 1. Usuarios ya compartidos (vienen del array compartidoConDetalles)
    const usuariosYaCompartidos = curso.compartidoConDetalles || [];
    
    // 2. Usuarios seleccionados en checkboxes
    const usuariosNuevosSeleccionados = Array.from(
        document.querySelectorAll('#listaUsuariosCompartirCurso input[type="checkbox"]:checked')
    ).map(cb => ({
        userId: cb.dataset.userid,
        userName: cb.dataset.username,
        email: cb.dataset.useremail || ''
    }));

    // 🔥 CORRECCIÓN: Validar que hay al menos UN usuario nuevo seleccionado
    // (los ya compartidos no cuentan para esta validación)
    if (usuariosNuevosSeleccionados.length === 0) {
        // Verificar si hay usuarios en la sección "Ya compartido con:"
        const hayUsuariosEnEdicion = document.querySelectorAll('.btn-editar-permisos').length > 0;
        
        if (!hayUsuariosEnEdicion) {
            mostrarNotificacion("Selecciona al menos un usuario nuevo para compartir", "error");
            return;
        }
        
        // Si solo hay usuarios ya compartidos, mostrar mensaje diferente
        if (usuariosYaCompartidos.length > 0) {
            mostrarNotificacion("Solo hay usuarios ya compartidos. Selecciona nuevos usuarios.", "info");
            return;
        }
    }

    // Obtener permisos si es modo colaboración
    let permisosEditar = false;
    let permisosCompartir = false;
    
    if (modoColaboracion) {
        permisosEditar = document.getElementById('checkPermisoEditar').checked;
        permisosCompartir = document.getElementById('checkPermisoCompartir').checked;
    }

       const btn = this;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Compartiendo...';


    try {
        let usuariosProcesados = 0;
        let errores = [];
        
        // 🔥 CORRECCIÓN: Filtrar usuarios ya compartidos de los nuevos
        // Para evitar duplicar operaciones con usuarios ya compartidos
        const usuariosParaCompartir = usuariosNuevosSeleccionados.filter(nuevo => {
            // Verificar si ya está compartido
            return !usuariosYaCompartidos.some(existente => 
                existente.userId === nuevo.userId
            );
        });
        
        // 🔥 CORRECCIÓN: Si no hay usuarios nuevos después de filtrar
        if (usuariosParaCompartir.length === 0 && usuariosYaCompartidos.length > 0) {
            mostrarNotificacion("Los usuarios seleccionados ya tienen acceso al curso", "info");
            return;
        }

        for (const usuario of usuariosParaCompartir) {
            try {
                if (modoCopia) {
                    await withTimeout(
                        compartirComoCopia(curso, usuario),
                        45000,
                        `La copia para ${usuario.userName} tardó demasiado.`
                    );
                } else {
                    await withTimeout(
                        compartirComoColaboracion(curso, usuario, permisosEditar, permisosCompartir),
                        20000,
                        `La colaboración para ${usuario.userName} tardó demasiado.`
                    );
                }
                usuariosProcesados++;
            } catch (error) {
                errores.push(`${usuario.userName}: ${error.message}`);
            }
        }

        // 🔥 CORRECCIÓN: Mostrar mensaje apropiado
        if (usuariosProcesados > 0) {
            mostrarNotificacion(
                `✅ Curso compartido exitosamente con ${usuariosProcesados} usuario(s)`,
                'success'
            );
            
            // Cerrar modal
            document.getElementById('modalCompartirCurso').classList.add('hidden');
            
            // Recargar cursos
            await cargarCursosUsuario();
            
            // Limpiar selección
            window.cursoCompartiendo = null;
        } else if (errores.length > 0) {
            // Mostrar errores específicos
            const mensajeErrores = errores.slice(0, 3).join(', ');
            mostrarNotificacion(`❌ Errores al compartir: ${mensajeErrores}${errores.length > 3 ? '...' : ''}`, 'error');
        }
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Función para compartir como copia
async function compartirComoCopia(cursoOriginal, usuarioDestino) {
    try {
        await authFetchJson("/api/moodle/share-course", {
            method: "POST",
            body: {
                courseId: cursoOriginal.id,
                mode: "copy",
                targetUid: usuarioDestino.userId,
                targetEmail: usuarioDestino.email || ""
            }
        });
    } catch (error) {
        throw new Error(`No se pudo crear copia para ${usuarioDestino.userName}: ${error.message}`);
    }
}

// Función para compartir como colaboración
async function compartirComoColaboracion(curso, usuarioDestino, permisosEditar, permisosCompartir) {
    try {
        await authFetchJson("/api/moodle/share-course", {
            method: "POST",
            body: {
                courseId: curso.id,
                mode: "collaboration",
                targetUid: usuarioDestino.userId,
                targetEmail: usuarioDestino.email || "",
                permissions: {
                    editar: permisosEditar === true,
                    compartir: permisosCompartir === true
                }
            }
        });
    } catch (error) {
        throw new Error(`No se pudo compartir con ${usuarioDestino.userName}: ${error.message}`);
    }
}


async function cargarUsuariosParaCompartirCurso() {
    try {
        const listaUsuarios = document.getElementById("listaUsuariosCompartirCurso");
        if (!listaUsuarios) return;

        // Limpiar lista
        listaUsuarios.innerHTML = `
            <div class="text-center py-4 text-gray-500 text-sm">
                <i class="fas fa-spinner fa-spin"></i> Cargando usuarios...
            </div>
        `;

        const response = await authFetchJson("/api/moodle/share-users", {
            method: "GET"
        });
        const users = Array.isArray(response?.users) ? response.users : [];

        if (!users.length) {
            listaUsuarios.innerHTML = `
                <div class="text-center py-4 text-gray-500 text-sm">
                    No hay usuarios registrados
                </div>
            `;
            return;
        }

        // Obtener información de usuarios con los que YA está compartido
        const cursoCompartiendo = window.cursoCompartiendo;
        let usuariosYaCompartidos = [];
        
        if (cursoCompartiendo && cursoCompartiendo.compartidoConDetalles) {
            usuariosYaCompartidos = cursoCompartiendo.compartidoConDetalles.map(d => ({
                userId: d.userId,
                userName: d.userName,
                permisos: d.permisos || { editar: false, compartir: false }
            }));
        }

        // Filtrar usuarios (excluir al usuario actual)
        const usuarios = [];
        users.forEach(userData => {
            if (userData.uid === currentUserId) return;
            const yaCompartido = usuariosYaCompartidos.find(u => u.userId === userData.uid);
            usuarios.push({
                id: userData.uid,
                uid: userData.uid,
                nombre: userData.displayName || userData.email || "Usuario",
                email: userData.email || "",
                yaCompartido: !!yaCompartido,
                permisos: yaCompartido ? yaCompartido.permisos : null
            });
        });

        // Renderizar lista
        let html = '';
        
        // Primero mostrar usuarios con los que YA está compartido
        const usuariosCompartidos = usuarios.filter(u => u.yaCompartido);
        const usuariosNoCompartidos = usuarios.filter(u => !u.yaCompartido);
        
        if (usuariosCompartidos.length > 0) {
            html += `
                <div class="mb-3">
                    <p class="text-xs font-medium text-green-600 mb-2">
                        <i class="fas fa-check-circle mr-1"></i>
                        Ya compartido con:
                    </p>
                    <div class="space-y-1">
            `;
            
            usuariosCompartidos.forEach(user => {
                const permisosTexto = user.permisos ? 
                    (user.permisos.editar ? 'Editable' : 'Solo lectura') : 
                    'Solo lectura';
                
                html += `
                    <div class="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-foreground">${user.nombre}</p>
                            <p class="text-xs text-muted-foreground">${user.email}</p>
                            <span class="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                <i class="fas fa-check mr-1"></i>${permisosTexto}
                            </span>
                        </div>
                        <div class="flex gap-2">
                            <button class="text-xs text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 btn-dejar-compartir" 
                                    data-userid="${user.uid}"
                                    data-username="${user.nombre}"
                                    title="Dejar de compartir">
                                <i class="fas fa-user-slash"></i>
                            </button>
                            <button class="text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 btn-editar-permisos" 
                                    data-userid="${user.uid}"
                                    data-username="${user.nombre}"
                                    title="Editar permisos">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `</div></div>`;
            
            if (usuariosNoCompartidos.length > 0) {
                html += `<div class="border-t pt-3 mt-3"></div>`;
            }
        }
        
        // Luego mostrar usuarios disponibles para compartir
        if (usuariosNoCompartidos.length > 0) {
            html += `
                <p class="text-xs text-muted-foreground mb-2">
                    <i class="fas fa-plus-circle mr-1"></i>
                    Selecciona uno o varios usuarios para compartir:
                </p>
            `;
            
            usuariosNoCompartidos.forEach(user => {
                html += `
                    <label class="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer">
                        <input type="checkbox" 
                               class="user-checkbox"
                               data-userid="${user.uid}"
                               data-username="${user.nombre}"
                               data-useremail="${user.email}">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-foreground">${user.nombre}</p>
                            <p class="text-xs text-muted-foreground">${user.email}</p>
                        </div>
                    </label>
                `;
            });
        } else {
            // 🔥 CORRECCIÓN: Mensaje cuando no hay usuarios nuevos disponibles
            html += `
                <div class="text-center py-4">
                    <i class="fas fa-users text-gray-400 text-2xl mb-2"></i>
                    <p class="text-sm text-gray-600">No hay más usuarios disponibles para compartir</p>
                    <p class="text-xs text-gray-400 mt-1">Todos los usuarios ya tienen acceso al curso</p>
                </div>
            `;
        }

        listaUsuarios.innerHTML = html;

        // Añadir eventos para los botones
        document.querySelectorAll('.btn-dejar-compartir').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const userId = e.currentTarget.dataset.userid;
                const userName = e.currentTarget.dataset.username;
                
                if (confirm(`¿Dejar de compartir el curso con ${userName}?`)) {
                    await dejarDeCompartirCurso(userId);
                }
            });
        });

        document.querySelectorAll('.btn-editar-permisos').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const userId = e.currentTarget.dataset.userid;
                const userName = e.currentTarget.dataset.username;
                
                await mostrarModalEditarPermisos(userId, userName);
            });
        });

    } catch (error) {
        document.getElementById("listaUsuariosCompartirCurso").innerHTML = `
            <div class="text-center py-4 text-red-500 text-sm">
                <i class="fas fa-exclamation-triangle mr-1"></i>
                Error al cargar usuarios
            </div>
        `;
    }
}

// Agrega esta función para mostrar cuántos usuarios están seleccionados
function actualizarContadorSeleccion() {
    const checkboxes = document.querySelectorAll('#listaUsuariosCompartirCurso input[type="checkbox"]:checked');
    const contadorElement = document.getElementById('contadorSeleccion');
    
    if (!contadorElement) {
        // Crear elemento si no existe
        const nuevoContador = document.createElement('div');
        nuevoContador.id = 'contadorSeleccion';
        nuevoContador.className = 'text-xs text-blue-600 mt-2 mb-3';
        
        const modalFooter = document.querySelector('#modalCompartirCurso .modal-footer');
        if (modalFooter) {
            modalFooter.insertBefore(nuevoContador, modalFooter.firstChild);
        }
    }
    
    const contador = document.getElementById('contadorSeleccion');
    if (contador) {
        if (checkboxes.length > 0) {
            contador.innerHTML = `<i class="fas fa-check-circle mr-1"></i>${checkboxes.length} usuario(s) seleccionado(s)`;
            contador.classList.remove('hidden');
        } else {
            contador.classList.add('hidden');
        }
    }
}

// En cargarUsuariosParaCompartirCurso, añade eventos a los checkboxes:
function agregarEventosCheckboxes() {
    document.querySelectorAll('.user-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', actualizarContadorSeleccion);
    });
}

// Llama a esta función después de renderizar la lista en cargarUsuariosParaCompartirCurso:
// En la parte final de cargarUsuariosParaCompartirCurso:
setTimeout(() => {
    agregarEventosCheckboxes();
    actualizarContadorSeleccion();
}, 100);

// Función para mostrar modal de edición de permisos
async function mostrarModalEditarPermisos(userId, userName) {
    const curso = window.cursoCompartiendo;
    if (!curso) return;
    
    // Obtener permisos actuales
    const detalleUsuario = curso.compartidoConDetalles?.find(d => d.userId === userId);
    const permisosActuales = detalleUsuario?.permisos || { editar: false, compartir: false };
    
    // Crear modal de edición de permisos
    const modalHTML = `
        <div id="modalEditarPermisos" class="modal fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000]">
            <div class="bg-card border-border w-[90%] max-w-md rounded-xl shadow-2xl p-6">
                <h3 class="text-lg font-semibold mb-4 text-foreground">Editar permisos</h3>
                
                <div class="mb-4">
                    <p class="text-sm text-muted-foreground mb-2">
                        Usuario: <span class="text-foreground font-semibold">${userName}</span>
                    </p>
                    <p class="text-xs text-muted-foreground mb-4">
                        Curso: <span class="text-foreground">${curso.nombre}</span>
                    </p>
                    
                    <div class="space-y-3 p-3 bg-accent rounded-md border border-border">
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   id="checkEditarPermisos" 
                                   ${permisosActuales.editar ? 'checked' : ''}
                                   class="mr-2">
                            <span class="text-sm text-foreground">Permitir edición</span>
                        </label>
                        
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   id="checkCompartirPermisos" 
                                   ${permisosActuales.compartir ? 'checked' : ''}
                                   class="mr-2">
                            <span class="text-sm text-foreground">Permitir compartir con otros</span>
                        </label>
                    </div>
                </div>
                
                <div class="flex justify-end gap-3 mt-6">
                    <button id="btnCancelarEditarPermisos"
                            class="px-3 py-1 text-sm bg-accent text-accent-foreground rounded hover:bg-accent/80 transition-colors">
                        Cancelar
                    </button>
                    
                    <button id="btnGuardarEditarPermisos"
                            class="px-4 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors">
                        Guardar cambios
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Eliminar modal anterior si existe
    const modalAnterior = document.getElementById('modalEditarPermisos');
    if (modalAnterior) modalAnterior.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Configurar eventos
    document.getElementById('btnCancelarEditarPermisos').onclick = () => {
        document.getElementById('modalEditarPermisos').remove();
    };
    
    document.getElementById('btnGuardarEditarPermisos').onclick = async () => {
        const editar = document.getElementById('checkEditarPermisos').checked;
        const compartir = document.getElementById('checkCompartirPermisos').checked;
        
        await actualizarPermisosUsuario(userId, editar, compartir);
        document.getElementById('modalEditarPermisos').remove();
    };
}

// Función para actualizar permisos de usuario
async function actualizarPermisosUsuario(userId, puedeEditar, puedeCompartir) {
    const curso = window.cursoCompartiendo;
    if (!curso || !currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            mostrarNotificacion("El curso no existe", "error");
            return;
        }
        
        const cursoData = cursoSnap.data();
        const compartidoConDetalles = cursoData.compartidoConDetalles || [];
        
        // Actualizar los permisos del usuario
        const nuevosDetalles = compartidoConDetalles.map(detalle => {
            if (detalle.userId === userId) {
                return {
                    ...detalle,
                    permisos: {
                        editar: puedeEditar,
                        compartir: puedeCompartir
                    },
                    fechaModificacion: new Date(),
                    modificadoPor: currentUserId
                };
            }
            return detalle;
        });
        
        // Actualizar en Firestore
        await updateDoc(cursoRef, {
            compartidoConDetalles: nuevosDetalles,
            actualizado: new Date()
        });
        
        // Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === curso.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].compartidoConDetalles = nuevosDetalles;
        }
        
        // Si el usuario actual está viendo el curso y perdió permisos, refrescar
        if (cursoDocId === curso.id && currentUserId === userId && !puedeEditar) {
            // Recargar el curso para reflejar los nuevos permisos
            await seleccionarCurso(curso.id);
        }
        
        mostrarNotificacion("✅ Permisos actualizados correctamente", 'success');
        
        // Recargar la lista de usuarios en el modal
        await cargarUsuariosParaCompartirCurso();
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
}


// Función para dejar de compartir un curso con un usuario
async function dejarDeCompartirCurso(userId) {
    const curso = window.cursoCompartiendo;
    if (!curso || !currentUserId) {
        mostrarNotificacion("Error: Datos incompletos", "error");
        return;
    }

    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            mostrarNotificacion("El curso no existe", "error");
            return;
        }
        
        const cursoData = cursoSnap.data();
        
        // Filtrar el usuario de los arrays de compartir
        const nuevoCompartidoCon = (cursoData.compartidoCon || []).filter(uid => uid !== userId);
        const nuevoCompartidoConDetalles = (cursoData.compartidoConDetalles || []).filter(
            detalle => detalle.userId !== userId
        );
        
        // Actualizar en Firestore
        await updateDoc(cursoRef, {
            compartidoCon: nuevoCompartidoCon,
            compartidoConDetalles: nuevoCompartidoConDetalles,
            actualizado: new Date()
        });
        
        // Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === curso.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].compartidoCon = nuevoCompartidoCon;
            cursosUsuario[cursoIndex].compartidoConDetalles = nuevoCompartidoConDetalles;
        }
        
        mostrarNotificacion("✅ Se dejó de compartir el curso", 'success');
        
        // Recargar la lista de usuarios en el modal
        await cargarUsuariosParaCompartirCurso();
        
    } catch (error) {
        mostrarNotificacion(`❌ Error: ${error.message}`, 'error');
    }
}

// Función para actualizar permisos de un usuario
window.actualizarPermisoUsuario = async function(userId, tipoPermiso, valor) {
    const curso = window.cursoCompartiendo;
    
    if (!curso || !userId) return;
    
    try {
        const cursoRef = doc(db, "moodleCourses", curso.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) return;
        
        const cursoData = cursoSnap.data();
        const compartidoConDetalles = cursoData.compartidoConDetalles || [];
        
        // Buscar y actualizar los permisos del usuario
        const nuevosDetalles = compartidoConDetalles.map(detalle => {
            if (detalle.userId === userId) {
                return {
                    ...detalle,
                    permisos: {
                        ...detalle.permisos,
                        [tipoPermiso]: valor
                    },
                    ultimaModificacion: new Date()
                };
            }
            return detalle;
        });
        
        await updateDoc(cursoRef, {
            compartidoConDetalles: nuevosDetalles,
            actualizado: new Date()
        });
        
        // Mostrar notificación
        const tipoTexto = tipoPermiso === 'editar' ? 'editar' : 'compartir';
        const accion = valor ? 'concedido' : 'revocado';
        mostrarNotificacion(`✅ Permiso para ${tipoTexto} ${accion}`, 'success');
        
    } catch (error) {
        mostrarNotificacion(`❌ Error actualizando permiso`, 'error');
        
        // Revertir el checkbox en la UI
        const checkbox = document.querySelector(`.permiso-${tipoPermiso}[data-userid="${userId}"]`);
        if (checkbox) {
            checkbox.checked = !valor;
        }
    }
};



// Abrir modal
document.getElementById("btnNuevoCurso").addEventListener("click", () => {
    inputNombreCurso.value = "";
    modalCrearCurso.classList.remove("hidden");
    modalCrearCurso.classList.add("flex");

    setTimeout(() => inputNombreCurso.focus(), 100);
});

// Cancelar
btnCancelarCrearCurso.addEventListener("click", () => {
    modalCrearCurso.classList.add("hidden");
    modalCrearCurso.classList.remove("flex");
});

let creandoCurso = false;

// Crear curso
btnCrearCurso.addEventListener("click", async () => {
    const nombre = inputNombreCurso.value.trim();
    if (!nombre) {
        inputNombreCurso.classList.add("border-red-500");
        setTimeout(() => inputNombreCurso.classList.remove("border-red-500"), 1000);
        return;
    }

    // 🔥 CORRECCIÓN CRÍTICA: Evitar múltiples ejecuciones
    if (creandoCurso) {
        return;
    }
    
    if (btnCrearCurso.disabled) {
        return;
    }
    
    // Guardar el estado original
    const originalBtnText = btnCrearCurso.innerHTML;
    
    // Bloquear
    creandoCurso = true;
    btnCrearCurso.disabled = true;
    btnCrearCurso.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    btnCrearCurso.classList.add('cursor-not-allowed', 'opacity-75');

    try {
        // 🔥 VERIFICACIÓN ADICIONAL: Revisar si ya existe curso con mismo nombre para este usuario
        const cursoExistente = cursosUsuario.find(c => 
            c.nombre.toLowerCase() === nombre.toLowerCase() && 
            c.userId === currentUserId
        );
        
        if (cursoExistente) {
            throw new Error(`Ya tienes un curso llamado "${nombre}". Usa un nombre diferente.`);
        }

        const nuevoId = crypto.randomUUID();
        

        const temaInicialId = crypto.randomUUID();
        const subtemaInicialId = crypto.randomUUID();
        const moduloTemarioInicialId = crypto.randomUUID();
        const moduloLecturaInicialId = crypto.randomUUID();

        const nuevoCurso = {
            cursoId: nuevoId,
            id: nuevoId,
            nombre: nombre,
            descripcion: "",
            userId: currentUserId,
            creado: new Date(),
            temas: [{
                id: temaInicialId,
                nombre: "Tema 1",
                subtemas: [{
                    id: subtemaInicialId,
                    nombre: "Subtema 1",
                    instrucciones: "",
                    contenidoGenerado: "",
                    modulos: [],
                    modulosIds: [moduloTemarioInicialId, moduloLecturaInicialId],
                    traducciones: []
                }]
            }],
            actualizado: new Date(),
            compartidoCon: [],
            compartidoConDetalles: []
        };

        // 🔥 Verificar que el curso no exista ya (doble verificación)
        const cursoRef = doc(db, "moodleCourses", nuevoId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (cursoSnap.exists()) {
            throw new Error("Error inesperado: El ID del curso ya existe. Intenta nuevamente.");
        }

        // 1. Guardar en Firebase
        await setDoc(cursoRef, nuevoCurso);
        await guardarModulo(moduloTemarioInicialId, {
            id: moduloTemarioInicialId,
            cursoId: nuevoId,
            subtemaId: subtemaInicialId,
            tipo: "Temario",
            nombre: "Temario",
            contenido: construirContenidoInicialModulo("Temario"),
            instrucciones: construirInstruccionesInicialesModulo("Temario"),
            incluirInstruccionOriginalEnPropuesta: false,
            incluirImagenOriginalEnPropuesta: false,
            generarGrafico: false,
            ignorarContextoOtrosModulos: false,
            traducciones: [],
            creado: Date.now(),
            actualizado: Date.now()
        }, nuevoId);
        await guardarModulo(moduloLecturaInicialId, {
            id: moduloLecturaInicialId,
            cursoId: nuevoId,
            subtemaId: subtemaInicialId,
            tipo: "Lectura",
            nombre: "Lectura",
            contenido: construirContenidoInicialModulo("Lectura"),
            instrucciones: construirInstruccionesInicialesModulo("Lectura"),
            incluirInstruccionOriginalEnPropuesta: false,
            incluirImagenOriginalEnPropuesta: false,
            generarGrafico: false,
            ignorarContextoOtrosModulos: false,
            traducciones: [],
            creado: Date.now(),
            actualizado: Date.now()
        }, nuevoId);
        localStorage.setItem("temaAbierto", temaInicialId);
        localStorage.setItem("subtemaAbierto", subtemaInicialId);
        localStorage.setItem("moduloActivo", moduloTemarioInicialId);
        
        // 2. Cerrar modal inmediatamente
        modalCrearCurso.classList.add("hidden");
        modalCrearCurso.classList.remove("flex");
        
        // 3. Limpiar el input
        inputNombreCurso.value = "";
        
        // 4. Recargar la lista
        await cargarCursosUsuario();
        
        // 5. Esperar un momento y seleccionar el curso creado
        setTimeout(() => {
            seleccionarCurso(nuevoId);
        }, 500);
        
        // 6. Mostrar notificación de éxito
        mostrarNotificacion(`Curso "${nombre}" creado exitosamente`, 'success');
        
    } catch (err) {
        
        // 🔥 Mensajes de error específicos
        let errorMessage = "Error al crear el curso";
        if (err.code === 'permission-denied') {
            errorMessage = "No tienes permisos para crear cursos";
        } else if (err.code === 'resource-exhausted') {
            errorMessage = "Límite de escrituras excedido. Intenta más tarde";
        } else if (err.message.includes("ya tienes") || err.message.includes("ya existe")) {
            errorMessage = err.message;
        } else {
            errorMessage = `Error: ${err.message}`;
        }
        
        mostrarNotificacion(errorMessage, 'error', true);
        
        // 🔥 Mantener el modal abierto si hay error de nombre duplicado
        if (!err.message.includes("ya tienes")) {
            modalCrearCurso.classList.add("hidden");
            modalCrearCurso.classList.remove("flex");
        }
        
    } finally {
        // 🔥 Re-habilitar el botón después de un tiempo
        setTimeout(() => {
            btnCrearCurso.disabled = false;
            btnCrearCurso.innerHTML = originalBtnText;
            btnCrearCurso.classList.remove('cursor-not-allowed', 'opacity-75');
            creandoCurso = false;
        }, 1500);
    }
});


// Función para limpiar todas las suscripciones activas
function limpiarTodasSuscripciones() {
    // Suscripción del curso
    if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
        window.cursoSnapshotUnsubscribe();
        window.cursoSnapshotUnsubscribe = null;
    }
    
    // Suscripciones de módulos
    if (window.suscripcionesModulos) {
        Object.values(window.suscripcionesModulos).forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        window.suscripcionesModulos = {};
    }
    
    // Limpiar otros listeners si existen
    if (window.cursoSeleccionadoListener) {
        window.cursoSeleccionadoListener.remove();
        window.cursoSeleccionadoListener = null;
    }
}

// Llamar esta función cuando se cierre un curso o cambie de página
document.addEventListener('beforeunload', limpiarTodasSuscripciones);

let seleccionandoCurso = false;

async function seleccionarCurso(id) {
    // 🔥 VERIFICACIÓN DE SEGURIDAD
    if (!id || typeof id !== 'string' || id.trim() === '') {
        return;
    }
    
    // 🔥 EVITAR EJECUCIÓN MÚLTIPLE
    if (seleccionandoCurso) {
        return;
    }
    
    // 🔥 Si ya es el curso activo, solo salir si el editor ya quedó cargado
    const editorActual = document.getElementById('contenidoEditor');
    const editorSigueVacio = !!editorActual?.querySelector('.empty-state');
    if (cursoDocId === id && !editorSigueVacio) {
        return;
    }
    
    seleccionandoCurso = true;

    try {
        // 🔥 LIMPIAR SUSCRIPCIONES ANTERIORES (UNA SOLA VEZ)
        if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
            window.cursoSnapshotUnsubscribe();
            window.cursoSnapshotUnsubscribe = null;
        }
        
        // Limpiar suscripciones de módulos
        limpiarSuscripcionesModulos();

        
        // Buscar el curso en la lista local
        let cursoLocal = cursosUsuario.find(c => c.id === id);
        
        if (!cursoLocal) {
            // Intentar cargar desde Firebase
            try {
                const cursoRef = doc(db, "moodleCourses", id);
                const cursoSnap = await getDoc(cursoRef);
                
                if (!cursoSnap.exists()) {
                    mostrarNotificacion("El curso no existe o ha sido eliminado", "error");
                    
                    // Recargar cursos y salir
                    await cargarCursosUsuario();
                    return;
                }
                
                const cursoData = cursoSnap.data();
                
                // Verificar acceso
                const esPropietario = cursoData.userId === currentUserId;
                const estaCompartido = isMoodleCourseSharedWithUser(cursoData, currentUserId);
                
                if (!esPropietario && !estaCompartido) {
                    mostrarNotificacion("No tienes acceso a este curso", "error");
                    return;
                }
                
                // Determinar permisos
                let permisosUsuario = { editar: false, compartir: false };
                if (!esPropietario) {
                    permisosUsuario = resolveMoodleCollabPermissions(cursoData, currentUserId);
                }
                
                // Crear objeto curso
                cursoLocal = {
                    id: id,
                    cursoId: cursoData.cursoId || id,
                    nombre: cursoData.nombre || "Curso sin nombre",
                    descripcion: cursoData.descripcion || "",
                    userId: cursoData.userId,
                    creado: cursoData.creado || new Date(),
                    temas: Array.isArray(cursoData.temas) ? cursoData.temas : [],
                    esPropio: esPropietario,
                    permisos: permisosUsuario,
                    tipo: esPropietario ? "propio" : "compartido"
                };
                
                // Agregar a la lista local
                const existe = cursosUsuario.some(c => c.id === id);
                if (!existe) {
                    cursosUsuario.push(cursoLocal);
                    renderListaCursos();
                }
                
            } catch (firebaseError) {
                mostrarNotificacion("Error al cargar el curso desde la base de datos", "error");
                return;
            }
        }
        
        if (!cursoLocal) {
            mostrarNotificacion("No se pudo cargar el curso", "error");
            return;
        }
        
        // 🔥 VERIFICACIÓN DE PERMISOS
        const esCursoPropio = cursoLocal.esPropio;
        const tienePermisoEditar = esCursoPropio || cursoLocal.permisos?.editar === true;
        
        // 🔥 CORRECCIÓN: Solo mostrar advertencia una vez al abrir (no confirm)
        if (!tienePermisoEditar) {
        }
        
        // Limpiar estados activos
        limpiarEstadosActivos();
        
        // Asignar curso a variables globales
        curso = { ...cursoLocal };
        cursoDocId = id;
        window.curso = curso;
        
        // Asegurar estructura válida
        curso.temas = Array.isArray(curso.temas) ? curso.temas : [];
        
        
        // Guardar selección en LocalStorage
        localStorage.setItem("cursoSeleccionado", id);
        
        // Actualizar UI de lista de cursos
        document.querySelectorAll('.curso-item').forEach(item => {
            item.classList.remove('active', 'highlight-pulse');
        });
        
        const cursoItemElement = document.querySelector(`.curso-item[data-id="${id}"]`);
        if (cursoItemElement) {
            cursoItemElement.classList.add('active', 'highlight-pulse');
            
            setTimeout(() => {
                cursoItemElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest'
                });
            }, 100);
        }
        
        // Actualizar información del curso en la UI
        const cursoNombreElement = document.getElementById("cursoSeleccionadoNombre");
        if (cursoNombreElement) {
            cursoNombreElement.innerText = curso.nombre;
            
            // Añadir indicador de modo solo si es de solo lectura
            if (!tienePermisoEditar) {
                const modoElement = document.createElement("span");
                modoElement.className = "ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full";
                modoElement.textContent = "Solo lectura";
                modoElement.id = "modoLecturaIndicator";
                
                // Remover indicador anterior si existe
                const indicadorAnterior = document.getElementById("modoLecturaIndicator");
                if (indicadorAnterior) indicadorAnterior.remove();
                
                cursoNombreElement.appendChild(modoElement);
            }
        }
        
        // Mostrar sidebar de temas
        const sidebarTemas = document.getElementById("sidebarTemas");
        if (sidebarTemas) {
            sidebarTemas.classList.remove("hidden");
            
            // Aplicar clase de modo lectura si corresponde
            if (!tienePermisoEditar) {
                sidebarTemas.classList.add('readonly-mode');
            } else {
                sidebarTemas.classList.remove('readonly-mode');
            }
        }
        
        // Configurar botón de añadir tema según permisos
        const btnAddTema = document.getElementById("btnAddTema");
        if (btnAddTema) {
            btnAddTema.disabled = !tienePermisoEditar;
            btnAddTema.title = tienePermisoEditar ? "Añadir nuevo tema" : "No tienes permisos para añadir temas";
            
            if (!tienePermisoEditar) {
                btnAddTema.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        // Botón exportar curso (disponible también en solo lectura)
        const btnExportCursoWord = document.getElementById("btnExportCursoWord");
        if (btnExportCursoWord) {
            btnExportCursoWord.disabled = false;
            btnExportCursoWord.title = "Descargar contenido de todos los temas (Word)";
            btnExportCursoWord.setAttribute("aria-label", btnExportCursoWord.title);
            btnExportCursoWord.classList.remove("opacity-50", "cursor-not-allowed");
        }
        
        // Renderizar temas
        renderTemas();
        
        // Configurar editor según permisos
        const contenidoEditor = document.getElementById('contenidoEditor');
        let seleccionRestaurada = false;
        if (contenidoEditor) {
            seleccionRestaurada = await restaurarSeleccionEditorDesdeStorage({
                puedeEditar: tienePermisoEditar
            });

            if (seleccionRestaurada) {
                if (!tienePermisoEditar) {
                    contenidoEditor.classList.add('readonly-mode');
                } else {
                    contenidoEditor.classList.remove('readonly-mode');
                }
            } else if (!tienePermisoEditar) {
                contenidoEditor.innerHTML = `
                    <div class="empty-state text-center py-10">
                        <i class="fas fa-eye text-3xl text-yellow-500 mb-2"></i>
                        <h3 class="text-sm font-semibold text-gray-700 mb-1">Modo Solo Lectura</h3>
                        <p class="text-xs text-gray-500 mb-3">
                            Este curso ha sido compartido contigo en modo solo lectura.
                        </p>
                        <p class="text-xs text-gray-400">
                            Selecciona un subtema para ver el contenido.
                        </p>
                    </div>
                `;
                
                // 🔥 CORRECCIÓN: Permitir contenido pero deshabilitar edición
                contenidoEditor.classList.add('readonly-mode');
            } else {
                // Modo edición normal
                contenidoEditor.innerHTML = `
                    <div class="empty-state text-center py-10 text-gray-400">
                        <i class="fas fa-layer-group text-3xl mb-2"></i>
                        <p class="text-sm">Selecciona un subtema para comenzar</p>
                    </div>
                `;
                contenidoEditor.classList.remove('readonly-mode');
            }
        }
        
        // 🔥 SUSCRIPCIÓN A CAMBIOS SOLO PARA CURSOS COMPARTIDOS
        if (!esCursoPropio) {
            // Cancelar suscripción anterior si existe
            if (window.cursoSnapshotUnsubscribe && typeof window.cursoSnapshotUnsubscribe === 'function') {
                window.cursoSnapshotUnsubscribe();
            }
            
            // Suscribirse a cambios en este curso
            const unsubscribe = suscribirACambiosCurso(id);
            
            if (unsubscribe) {
                window.cursoSnapshotUnsubscribe = unsubscribe;
                window.suscripcionCursoId = id;
            } else {
            }
        } else if (window.cursoSnapshotUnsubscribe) {
            // Si es curso propio pero hay suscripción anterior, limpiarla
            window.cursoSnapshotUnsubscribe();
            window.cursoSnapshotUnsubscribe = null;
            window.suscripcionCursoId = null;
        }

        // Forzar actualización de la lista de cursos
        setTimeout(() => {
            renderListaCursos();
        }, 300);
        
        
    } catch (error) {
        
        // 🔥 MEJOR MANEJO DE ERRORES
        let errorMessage = "Error al seleccionar el curso";
        
        if (error.code === 'permission-denied') {
            errorMessage = "No tienes permiso para acceder a este curso";
        } else if (error.code === 'not-found') {
            errorMessage = "El curso no existe o ha sido eliminado";
            // Recargar lista de cursos
            await cargarCursosUsuario();
        }
        
        mostrarNotificacion(errorMessage, "error");
        
        // 🔥 Limpiar UI solo en caso de error
        limpiarUIError();
        
    } finally {
        // 🔥 DESBLOQUEAR siempre
        seleccionandoCurso = false;
    }
}


function mostrarNotificacion(mensaje, tipo = 'info', esPersistente = false) {
    // 🔥 Evitar notificaciones duplicadas en ventana de 1 segundo
    if (window.ultimaNotificacion && 
        Date.now() - window.ultimaNotificacion < 1000 && 
        window.ultimoMensajeNotificacion === mensaje) {
        return;
    }
    
    window.ultimaNotificacion = Date.now();
    window.ultimoMensajeNotificacion = mensaje;
    
    const tipos = {
        success: {
            clase: 'bg-green-100 border-green-400 text-green-700',
            icono: 'fa-check-circle'
        },
        error: {
            clase: 'bg-red-100 border-red-400 text-red-700',
            icono: 'fa-exclamation-circle'
        },
        info: {
            clase: 'bg-blue-100 border-blue-400 text-blue-700',
            icono: 'fa-info-circle'
        },
        warning: {
            clase: 'bg-yellow-100 border-yellow-400 text-yellow-700',
            icono: 'fa-exclamation-triangle'
        }
    };
    
    const config = tipos[tipo] || tipos.info;
    
    const notificacion = document.createElement('div');
    notificacion.className = `fixed top-4 right-4 p-4 rounded-lg border ${config.clase} shadow-lg z-[1000] transform transition-all duration-300 translate-x-full max-w-sm`;
    notificacion.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas ${config.icono}"></i>
            <p class="text-sm font-medium">${mensaje}</p>
        </div>
    `;
    
    document.body.appendChild(notificacion);
    
    // Animación de entrada
    setTimeout(() => {
        notificacion.classList.remove('translate-x-full');
        notificacion.classList.add('translate-x-0');
    }, 10);
    
    // Auto-eliminar
    const tiempo = esPersistente ? 5000 : 3000;
    setTimeout(() => {
        notificacion.classList.remove('translate-x-0');
        notificacion.classList.add('translate-x-full');
        setTimeout(() => {
            if (notificacion.parentNode) {
                notificacion.parentNode.removeChild(notificacion);
            }
        }, 300);
    }, tiempo);
}



// Función auxiliar para limpiar UI en caso de error
function limpiarUIError() {
    
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.add("hidden");
        sidebarTemas.classList.remove('readonly-mode');
    }
    
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.innerHTML = `
            <div class="empty-state text-center py-10 text-gray-400">
                <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                <p class="text-sm">Error al cargar el curso</p>
                <p class="text-xs mt-2">Selecciona otro curso o recarga la página</p>
            </div>
        `;
        contenidoEditor.classList.remove('readonly-mode');
    }
    
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = true;
        btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    // btnDescargarCursoWord removido del UI
    
    // Limpiar variables globales
    cursoDocId = null;
    curso = null;
    temaActivo = null;
    subtemaActivo = null;
    
    // Limpiar localStorage relacionado
    localStorage.removeItem("temaAbierto");
    localStorage.removeItem("subtemaAbierto");
    localStorage.removeItem("moduloActivo");
    
    // Actualizar nombre del curso en UI
    const cursoNombreElement = document.getElementById("cursoSeleccionadoNombre");
    if (cursoNombreElement) {
        cursoNombreElement.innerText = "Selecciona un curso";
        // Remover indicador de modo lectura
        const indicador = document.getElementById("modoLecturaIndicator");
        if (indicador) indicador.remove();
    }
}

async function restaurarSeleccionEditorDesdeStorage({ puedeEditar = true } = {}) {
    const subtemaId = localStorage.getItem("subtemaAbierto");
    if (!subtemaId || !curso?.temas?.length) return false;

    let temaEncontrado = null;
    let subtemaEncontrado = null;

    for (const tema of curso.temas) {
        const match = tema?.subtemas?.find((sub) => sub?.id === subtemaId);
        if (match) {
            temaEncontrado = tema;
            subtemaEncontrado = match;
            break;
        }
    }

    if (!subtemaEncontrado) return false;

    temaActivo = temaEncontrado;
    subtemaActivo = subtemaEncontrado;
    window.temaActivo = temaEncontrado;
    window.subtemaActivo = subtemaEncontrado;

    const moduloId = localStorage.getItem("moduloActivo");
    const moduloPerteneceASubtema = moduloId && Array.isArray(subtemaEncontrado.modulosIds)
        ? subtemaEncontrado.modulosIds.includes(moduloId)
            || subtemaEncontrado.modulosIds.includes(String(moduloId).split('_').pop())
        : false;

    await cargarSubtema(
        subtemaEncontrado,
        moduloPerteneceASubtema ? moduloId : null,
        !puedeEditar
    );

    return true;
}

// Función para suscribirse a cambios en tiempo real (si no la tienes)
function suscribirACambiosCurso(cursoId) {
    if (!cursoId || !db) {
        return null;
    }
    
    try {
        const cursoRef = doc(db, "moodleCourses", cursoId);
        
        
        const unsubscribe = onSnapshot(cursoRef, 
            async (snapshot) => {
                // 🔥 CORRECCIÓN: Verificar que el curso aún esté seleccionado
                if (cursoDocId !== cursoId) {
                    return;
                }
                
                if (!snapshot.exists()) {
                    mostrarNotificacion("El curso ha sido eliminado", "warning");
                    
                    // Cerrar el curso
                    if (cursoDocId === cursoId) {
                        limpiarUIError();
                        cargarCursosUsuario();
                    }
                    return;
                }
                
                const data = snapshot.data();
                
                // 🔥 CORRECCIÓN IMPORTANTE: Evitar loops cuando se pierden permisos
                // Si el usuario actual NO es el propietario
                const esPropietario = data.userId === currentUserId;
                
                if (!esPropietario && data.compartidoConDetalles) {
                    const detalleUsuario = data.compartidoConDetalles.find(
                        detalle => detalle.userId === currentUserId
                    );
                    
                    // Si el usuario ya no está en la lista compartida
                    if (!detalleUsuario) {
                        mostrarNotificacion("Se ha revocado tu acceso a este curso", "warning", true);
                        
                        // Limpiar UI sin volver a llamar seleccionarCurso
                        limpiarUIError();
                        await cargarCursosUsuario();
                        return;
                    }
                    
                    // Si tiene permisos actualizados
                    const nuevosPermisos = {
                        editar: detalleUsuario.permisos?.editar || false,
                        compartir: detalleUsuario.permisos?.compartir || false
                    };
                    
                    // Actualizar permisos en la lista local
                    const cursoIndex = cursosUsuario.findIndex(c => c.id === cursoId);
                    if (cursoIndex !== -1) {
                        cursosUsuario[cursoIndex].permisos = nuevosPermisos;
                    }
                    
                    // 🔥 CORRECCIÓN: Solo refrescar si realmente cambió el estado de edición
                    const cursoActual = cursosUsuario.find(c => c.id === cursoId);
                    if (cursoActual) {
                        const teniaEdicionAnterior = curso.permisos?.editar === true;
                        const tieneEdicionAhora = nuevosPermisos.editar === true;
                        
                        if (teniaEdicionAnterior && !tieneEdicionAhora) {
                            // Actualizar UI sin recargar completamente
                            actualizarUIParaModoLectura();
                        } else if (!teniaEdicionAnterior && tieneEdicionAhora) {
                            actualizarUIParaModoEdicion();
                        }
                        
                        // Actualizar permisos en el objeto curso global
                        if (curso.permisos) {
                            curso.permisos.editar = nuevosPermisos.editar;
                            curso.permisos.compartir = nuevosPermisos.compartir;
                        }
                    }
                }
                
                // Resto del código para actualizar contenido en tiempo real...
                // (mantener el código existente para temas, módulos, etc.)
                
                // 🔥 NUEVO: Actualizar contenido de módulos en tiempo real
                if (cursoDocId === cursoId && data) {
                    // ... (código existente)
                }
                
                // Actualizar datos del curso si es necesario
                if (cursoDocId === cursoId) {
                    // ... (código existente)
                }
            }, 
            (error) => {
                
                // Manejar errores específicos
                if (error.code === 'permission-denied') {
                    mostrarNotificacion("No tienes permiso para ver cambios en tiempo real", "warning", true);
                }
            }
        );
        
        return unsubscribe;
        
    } catch (error) {
        return null;
    }
}

// Función para actualizar UI a modo lectura sin recargar completamente
function actualizarUIParaModoLectura() {
    
    // Actualizar botón de añadir tema
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = true;
        btnAddTema.classList.add('opacity-50', 'cursor-not-allowed');
        btnAddTema.title = "No tienes permisos para añadir temas";
    }
    
    // Actualizar sidebar
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.add('readonly-mode');
    }
    
    // Actualizar editor
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.classList.add('readonly-mode');
        
        // Deshabilitar todos los botones de edición
        contenidoEditor.querySelectorAll('button, .icon-btn').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        });
    }
    
    // Mostrar notificación una sola vez
    mostrarNotificacion("Se han revocado tus permisos de edición. Ahora estás en modo solo lectura.", "warning", true);
}

// Función para actualizar UI a modo edición
function actualizarUIParaModoEdicion() {
    
    // Actualizar botón de añadir tema
    const btnAddTema = document.getElementById("btnAddTema");
    if (btnAddTema) {
        btnAddTema.disabled = false;
        btnAddTema.classList.remove('opacity-50', 'cursor-not-allowed');
        btnAddTema.title = "Añadir nuevo tema";
    }

    // btnDescargarCursoWord removido del UI
    
    // Actualizar sidebar
    const sidebarTemas = document.getElementById("sidebarTemas");
    if (sidebarTemas) {
        sidebarTemas.classList.remove('readonly-mode');
    }
    
    // Actualizar editor
    const contenidoEditor = document.getElementById('contenidoEditor');
    if (contenidoEditor) {
        contenidoEditor.classList.remove('readonly-mode');
        
        // Habilitar todos los botones de edición
        contenidoEditor.querySelectorAll('button, .icon-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        });
    }
    
    mostrarNotificacion("Tienes permisos de edición para este curso.", "success", true);
}

let suscripcionesModulos = {};

function suscribirCambiosModulo(moduloId) {
    if (!moduloId || !curso || !curso.id) return;
    
    // Ya tenemos suscripción para este módulo
    if (suscripcionesModulos[moduloId]) return;
    
    // Crear ID compuesto para Firestore
    const moduloDocId = moduloId.includes('_') ? moduloId : `${curso.id}_${moduloId}`;
    const moduloRef = doc(db, "moodleCourses", moduloDocId);
    
    
    const unsubscribe = onSnapshot(moduloRef,
        (snapshot) => {
            if (!snapshot.exists()) {
                // Eliminar suscripción
                if (suscripcionesModulos[moduloId]) {
                    suscripcionesModulos[moduloId]();
                    delete suscripcionesModulos[moduloId];
                }
                return;
            }
            
            const data = snapshot.data();
            if (!data) return;
            
            // 🔥 ACTUALIZAR CONTENIDO EN TIEMPO REAL
            const contenidoDiv = document.getElementById(`contenido-${moduloId}`);
            if (contenidoDiv) {
                const contenidoRenderizado = renderizarContenidoModulo(data.contenido || "", data.tipo || "");
                if (contenidoDiv.innerHTML === contenidoRenderizado) return;

                contenidoDiv.innerHTML = contenidoRenderizado;
                
                // Reactivar menú contextual
                setTimeout(() => {
                    if (typeof activarAccionesEnParrafos === 'function') {
                        activarAccionesEnParrafos();
                    }
                }, 100);
                
                // Mostrar notificación
                mostrarNotificacion(`Módulo "${data.nombre || 'sin nombre'}" actualizado`, 'info');
            }
        },
        (error) => {
        }
    );
    
    suscripcionesModulos[moduloId] = unsubscribe;
}

// Función para limpiar todas las suscripciones de módulos
function limpiarSuscripcionesModulos() {
    Object.values(suscripcionesModulos).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    suscripcionesModulos = {};
}



function verificarPermisosAccion(accion, cursoId) {
    const curso = cursosUsuario.find(c => c.id === cursoId);
    if (!curso) return false;
    
    // Si es propio, tiene todos los permisos
    if (curso.esPropio) return true;
    
    // Verificar permisos específicos
    switch(accion) {
        case 'editar':
            return curso.permisos?.editar === true;
        case 'compartir':
            return curso.permisos?.compartir === true;
        case 'eliminar':
            return curso.esPropio; // Solo propietario puede eliminar
        default:
            return false;
    }
}


const modalEditarCurso = document.getElementById("modalEditarCurso");
const inputEditarNombreCurso = document.getElementById("inputEditarNombreCurso");

let cursoEditando = null;

// Cancelar
document.getElementById("btnCancelarEditarCurso").onclick = () => {
    modalEditarCurso.classList.add("hidden");
    modalEditarCurso.classList.remove("flex");
};

// Guardar
document.getElementById("btnConfirmarEditarCurso").onclick = async () => {
    const nuevoNombre = inputEditarNombreCurso.value.trim();
    if (!nuevoNombre || !cursoEditando) return;

    try {
        // 1. Verificar que el documento existe antes de actualizar
        const cursoRef = doc(db, "moodleCourses", cursoEditando.id);
        const cursoSnap = await getDoc(cursoRef);
        
        if (!cursoSnap.exists()) {
            alert("Error: El curso no existe en la base de datos.");
            
            // Recargar lista de cursos
            await cargarCursosUsuario();
            modalEditarCurso.classList.add("hidden");
            return;
        }

        // 2. Actualizar en Firebase
        await updateDoc(cursoRef, { nombre: nuevoNombre });

        // 3. Actualizar en la lista local
        const cursoIndex = cursosUsuario.findIndex(c => c.id === cursoEditando.id);
        if (cursoIndex !== -1) {
            cursosUsuario[cursoIndex].nombre = nuevoNombre;
        }

        // 4. Si el curso editado es el que está seleccionado, actualizar la UI
        if (cursoDocId === cursoEditando.id) {
            curso.nombre = nuevoNombre;
            document.getElementById("cursoSeleccionadoNombre").innerText = nuevoNombre;
        }

        // 5. Cerrar modal
        modalEditarCurso.classList.add("hidden");
        modalEditarCurso.classList.remove("flex");

        // 6. Actualizar la lista de cursos
        renderListaCursos();

        alert("Curso editado exitosamente.");

    } catch (err) {
        
        if (err.code === 'not-found') {
            alert("Error: El curso no existe. Se ha eliminado o no se pudo encontrar.");
            // Recargar lista de cursos
            await cargarCursosUsuario();
        } else if (err.code === 'permission-denied') {
            alert("Error: No tienes permiso para editar este curso.");
        } else {
            alert("Error al editar el curso: " + err.message);
        }
        
        modalEditarCurso.classList.add("hidden");
        modalEditarCurso.classList.remove("flex");
    }
};





/* GUARDAR AUTOMÁTICAMENTE EN FIREBASE */
/* GUARDAR AUTOMÁTICAMENTE EN FIREBASE */
window.guardarCursoFirebase = async function () {
    if (!cursoDocId || !curso) {
        return false;
    }
    
    try {
        // Verificar permisos para cursos compartidos
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        if (!cursoActual) {
            return false;
        }
        
        // Verificar permisos
        if (!cursoActual.esPropio && !cursoActual.permisos?.editar) {
            mostrarNotificacion("No tienes permisos para editar este curso", "error");
            return false;
        }

        
        // Crear copia profunda para evitar mutaciones
        const cursoParaGuardar = JSON.parse(JSON.stringify({
            cursoId: curso.cursoId || cursoDocId,
            nombre: curso.nombre || "Curso sin nombre",
            descripcion: curso.descripcion || "",
            userId: curso.userId || currentUserId,
            creado: curso.creado || new Date(),
            temas: Array.isArray(curso.temas) ? curso.temas : [],
            actualizado: new Date()
        }));
        
        
        // Obtener datos existentes para mantener información de compartir
        const cursoRef = doc(db, "moodleCourses", cursoDocId);
        const cursoSnap = await getDoc(cursoRef);
        
        if (cursoSnap.exists()) {
            const datosExistentes = cursoSnap.data();
            if (datosExistentes.userId) {
                cursoParaGuardar.userId = datosExistentes.userId;
            }
            if (datosExistentes.uid && !cursoParaGuardar.uid) {
                cursoParaGuardar.uid = datosExistentes.uid;
            }
            if (datosExistentes.ownerUid && !cursoParaGuardar.ownerUid) {
                cursoParaGuardar.ownerUid = datosExistentes.ownerUid;
            }
            
            // Mantener datos de colaboración si existen
            if (datosExistentes.compartidoCon) {
                cursoParaGuardar.compartidoCon = datosExistentes.compartidoCon;
            }
            
            if (datosExistentes.compartidoConDetalles) {
                cursoParaGuardar.compartidoConDetalles = datosExistentes.compartidoConDetalles;
            }
            
            if (datosExistentes.propietarioNombre) {
                cursoParaGuardar.propietarioNombre = datosExistentes.propietarioNombre;
            }
        }
        
        // Usar setDoc para reemplazar todo el documento
        await setDoc(doc(db, "moodleCourses", cursoDocId), cursoParaGuardar, { merge: true });
        
        return true;
    } catch (error) {
        alert("Error al guardar el curso: " + error.message);
        return false;
    }
}




/* ELEMENTOS DEL DOM */
const listaTemas = document.getElementById("listaTemasSidebar");
const sidebarCursosEl = document.getElementById("sidebar2");
const sidebarTemasEl = document.getElementById("sidebarTemas");
const contenidoEditorEl = document.getElementById("contenidoEditor");
const editorResizeWrapEl = document.getElementById("editorResizeWrap");
const resizeSidebarCursosEl = document.getElementById("resizeSidebar2");
const resizeSidebarTemasEl = document.getElementById("resizeSidebarTemas");
const resizeContenidoEditorEl = document.getElementById("resizeContenidoEditor");

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function habilitarResizeHorizontal(handleEl, targetEl, options = {}) {
    if (!handleEl || !targetEl) return;

    const {
        min = 240,
        max = 720,
        storageKey = null,
        getMax = null
    } = options;

    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : null;
    if (!Number.isNaN(stored) && stored) {
        const maxNow = typeof getMax === "function" ? getMax() : max;
        targetEl.style.width = `${clamp(stored, min, maxNow)}px`;
    }

    const onPointerDown = (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = targetEl.getBoundingClientRect().width;
        handleEl.classList.add("is-dragging");

        const onMove = (moveEvent) => {
            const maxCurrent = typeof getMax === "function" ? getMax() : max;
            const next = clamp(startWidth + (moveEvent.clientX - startX), min, maxCurrent);
            targetEl.style.width = `${next}px`;
        };

        const onUp = () => {
            handleEl.classList.remove("is-dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            if (storageKey) {
                const w = Math.round(targetEl.getBoundingClientRect().width);
                localStorage.setItem(storageKey, String(w));
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    handleEl.addEventListener("pointerdown", onPointerDown);
}

function inicializarResizersPaneles() {
    habilitarResizeHorizontal(resizeSidebarCursosEl, sidebarCursosEl, {
        min: 220,
        max: 480,
        storageKey: "cb_sidebar2_width"
    });

    habilitarResizeHorizontal(resizeSidebarTemasEl, sidebarTemasEl, {
        min: 320,
        max: 680,
        storageKey: "cb_sidebarTemas_width"
    });

    habilitarResizeHorizontal(resizeContenidoEditorEl, contenidoEditorEl, {
        min: 420,
        max: 1600,
        storageKey: "cb_contenidoEditor_width",
        getMax: () => {
            if (!editorResizeWrapEl || !resizeContenidoEditorEl) return 1600;
            const total = editorResizeWrapEl.getBoundingClientRect().width;
            const handleWidth = resizeContenidoEditorEl.getBoundingClientRect().width || 6;
            return Math.max(420, Math.floor(total - handleWidth));
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarResizersPaneles);
} else {
    inicializarResizersPaneles();
}

const contenidoEditor = document.getElementById('contenidoEditor');
const textFormatMenu = document.getElementById('textFormatMenu');

let currentRange = null; // Para guardar la selección de texto

const btnAddTema = document.getElementById("btnAddTema");
btnAddTema.disabled = true; // sólo al inicio

function resolveCursoActivoParaNuevoTema() {
    if (curso && (curso.id || curso.cursoId)) return curso;
    const activeId = String(cursoDocId || localStorage.getItem("cursoSeleccionado") || "").trim();
    if (!activeId) return null;
    const localCourse = cursosUsuario.find((item) => String(item?.id || item?.cursoId || "").trim() === activeId);
    if (localCourse) {
        curso = { ...localCourse };
        window.curso = curso;
        cursoDocId = activeId;
        return curso;
    }
    return null;
}


/* AÑADIR TEMA */
/* AÑADIR TEMA - MODAL EN LUGAR DE PROMPT */
btnAddTema.addEventListener("click", async () => {
    const cursoActivo = resolveCursoActivoParaNuevoTema();
    if (!cursoActivo) {
        return alert("Primero selecciona un curso para añadir temas.");
    }

    // Crear modal dinámico si no existe
    if (!document.getElementById("modalAddTema")) {
        const modalHTML = `
            <div id="modalAddTema" class="modal fixed inset-0 bg-black/45 backdrop-blur-sm z-50 hidden items-center justify-center">
                <div class="bg-card text-foreground border border-border rounded-lg p-6 w-full max-w-md">
                    <h3 class="text-lg font-semibold mb-4 text-foreground">Nuevo Tema</h3>
                    <p class="text-sm text-muted-foreground mb-2">Curso: ${cursoActivo.nombre}</p>
                    <input 
                        type="text" 
                        id="inputNombreTema" 
                        placeholder="Nombre del nuevo tema"
                        class="w-full p-2 border border-input bg-background text-foreground rounded mb-4"
                    >
                    <div class="flex justify-end gap-2">
                        <button 
                            id="btnCancelarTema"
                            class="px-4 py-2 text-accent-foreground bg-accent hover:bg-accent/80 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            id="btnConfirmarTema"
                            class="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                            Crear
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const modal = document.getElementById("modalAddTema");
    const input = document.getElementById("inputNombreTema");
    const btnCancelar = document.getElementById("btnCancelarTema");
    const btnConfirmar = document.getElementById("btnConfirmarTema");

    // Actualizar nombre del curso en el modal
    modal.querySelector("p").textContent = `Curso: ${cursoActivo.nombre}`;
    
    input.value = "";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    setTimeout(() => input.focus(), 100);

    // Esperar confirmación
    const nombre = await new Promise((resolve) => {
        const limpiarEventos = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };

        btnConfirmar.onclick = () => {
            const valor = input.value.trim();
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(valor);
        };

        btnCancelar.onclick = () => {
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(null);
        };

        // Enter para confirmar
        input.onkeypress = (e) => {
            if (e.key === 'Enter') btnConfirmar.click();
        };
        
        // Escape para cancelar
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') btnCancelar.click();
        };
    });

    if (!nombre) return;

    const temaId = crypto.randomUUID();
    const subtemaId = crypto.randomUUID();
    const moduloTemarioId = crypto.randomUUID();
    const moduloLecturaId = crypto.randomUUID();

    const tema = {
        id: temaId,
        nombre: nombre.trim(),
        subtemas: [{
            id: subtemaId,
            nombre: "Subtema 1",
            instrucciones: "",
            contenidoGenerado: "",
            modulos: [],
            modulosIds: [moduloTemarioId, moduloLecturaId],
            traducciones: []
        }]
    };

    cursoActivo.temas = Array.isArray(cursoActivo.temas) ? cursoActivo.temas : [];
    cursoActivo.temas.push(tema);
    curso = cursoActivo;
    window.curso = cursoActivo;

    await guardarModulo(moduloTemarioId, {
        id: moduloTemarioId,
        cursoId: cursoActivo.id,
        subtemaId,
        tipo: "Temario",
        nombre: "Temario",
        contenido: construirContenidoInicialModulo("Temario"),
        instrucciones: construirInstruccionesInicialesModulo("Temario"),
        incluirInstruccionOriginalEnPropuesta: false,
        incluirImagenOriginalEnPropuesta: false,
        generarGrafico: false,
        ignorarContextoOtrosModulos: false,
        traducciones: [],
        creado: Date.now(),
        actualizado: Date.now()
    });

    await guardarModulo(moduloLecturaId, {
        id: moduloLecturaId,
        cursoId: cursoActivo.id,
        subtemaId,
        tipo: "Lectura",
        nombre: "Lectura",
        contenido: construirContenidoInicialModulo("Lectura"),
        instrucciones: construirInstruccionesInicialesModulo("Lectura"),
        incluirInstruccionOriginalEnPropuesta: false,
        incluirImagenOriginalEnPropuesta: false,
        generarGrafico: false,
        ignorarContextoOtrosModulos: false,
        traducciones: [],
        creado: Date.now(),
        actualizado: Date.now()
    });

    await guardarCursoFirebase();
    localStorage.setItem("temaAbierto", temaId);
    localStorage.setItem("subtemaAbierto", subtemaId);
    localStorage.setItem("moduloActivo", moduloTemarioId);
    renderTemas();
});

function getModuloIcon(tipo) {
    const icons = {
        "Quizz": "fa-square-check",
        "Página": "fa-file-lines",
        "Temario": "fa-list-check",
        "Lectura": "fa-book-open-reader",
        "Archivo": "fa-file-arrow-down",
        "Libro": "fa-book",
        "Lección": "fa-person-chalkboard",
        "Tarea": "fa-pen-to-square",
        "URL": "fa-link",
        "Archivo adjunto": "fa-paperclip"
    };

    return icons[tipo] || "fa-file"; // default
}

function destruirSortablesSidebar() {
    if (sortableTemasInstance?.destroy) {
        sortableTemasInstance.destroy();
    }
    sortableTemasInstance = null;

    sortableSubtemasInstances.forEach((inst) => {
        if (inst?.destroy) inst.destroy();
    });
    sortableSubtemasInstances = [];
}

function inicializarSidebarSortable() {
    if (!USE_SORTABLE_SIDEBAR || !listaTemas || !curso?.temas) return;

    destruirSortablesSidebar();

    sortableTemasInstance = window.Sortable.create(listaTemas, {
        animation: 160,
        draggable: ".tema-dropzone",
        handle: ".accordion-trigger",
        ghostClass: "cb-sortable-ghost",
        chosenClass: "cb-sortable-chosen",
        dragClass: "cb-sortable-drag",
        filter: ".btn-export-tema, .btn-add-subtema, .btn-duplicate-tema, .btn-edit-tema, .btn-delete-tema, .subtema-draggable, .subtema-draggable *",
        preventOnFilter: false,
        onEnd: async (evt) => {
            if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
            const [temaMovido] = curso.temas.splice(evt.oldIndex, 1);
            if (!temaMovido) return;
            curso.temas.splice(evt.newIndex, 0, temaMovido);
            await guardarCursoFirebase();
            renderTemas();
        }
    });

    document.querySelectorAll(".subtemas-container").forEach((container) => {
        const instancia = window.Sortable.create(container, {
            group: "subtemas-sidebar",
            animation: 160,
            draggable: ".subtema-draggable",
            handle: ".accordion-trigger",
            ghostClass: "cb-sortable-ghost",
            chosenClass: "cb-sortable-chosen",
            dragClass: "cb-sortable-drag",
            filter: ".btn-duplicate-subtema, .btn-edit-subtema, .btn-delete-subtema, .module-draggable, .module-draggable *",
            preventOnFilter: false,
            onEnd: async (evt) => {
                const subtemaId = evt.item?.dataset?.id;
                const temaIdOrigen = evt.from?.dataset?.temaId;
                const temaIdDestino = evt.to?.dataset?.temaId;

                if (!subtemaId || !temaIdOrigen || !temaIdDestino || evt.newIndex == null) return;
                if (temaIdOrigen === temaIdDestino && evt.oldIndex === evt.newIndex) return;

                const cambioAplicado = moverSubtemaConPosicion(
                    temaIdOrigen,
                    temaIdDestino,
                    subtemaId,
                    evt.newIndex
                );
                if (!cambioAplicado) return;

                await guardarCursoFirebase();
                renderTemas();
            }
        });
        sortableSubtemasInstances.push(instancia);
    });
}


/* RENDER TEMAS + LOCALSTORAGE */
/* ==========================================================
      RENDER TEMAS + LOCALSTORAGE + DRAG SUBTEMAS
========================================================== */


function renderTemas() {
    try {
        listaTemas.innerHTML = "";

        const subtemaAbierto = localStorage.getItem("subtemaAbierto");
        const moduloActivo = localStorage.getItem("moduloActivo");

        // 🔥 Primero, verificar si el módulo activo aún existe en algún lugar
        let moduloActivoExiste = false;
        if (moduloActivo) {
            curso.temas.forEach(tema => {
                tema.subtemas.forEach(sub => {
                    if (sub.modulosIds && sub.modulosIds.includes(moduloActivo)) {
                        moduloActivoExiste = true;
                    }
                });
            });
            
            if (!moduloActivoExiste) {
                localStorage.removeItem("moduloActivo");
            }
        }

        curso.temas.forEach(tema => {
            /* ---------------------------
                TEMA (Accordion)
            --------------------------- */
            const temaWrapper = document.createElement("div");
            temaWrapper.className = "accordion tema-dropzone";
            temaWrapper.dataset.temaId = tema.id;

            const contieneSubtemaActivo = tema.subtemas.some(s => s.id === subtemaAbierto);

            temaWrapper.innerHTML = `
                <div class="accordion-trigger flex items-center gap-2 ${contieneSubtemaActivo ? 'bg-blue-50' : ''}">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-folder cb-node-icon"></i>
                        <span class="font-medium">${tema.nombre}</span>
                    </div>

                    <div class="flex items-center gap-3">
                        <i class="fas fa-file-word cursor-pointer cb-action-icon btn-export-tema" title="Descargar TODOS los subtemas en Word"></i>
                        <i class="fas fa-plus cursor-pointer cb-action-icon btn-add-subtema"></i>
                        <i class="fas fa-clone cursor-pointer cb-action-icon btn-duplicate-tema"></i>
                        <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-tema"></i>
                        <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-tema"></i>
                        <i class="fas fa-chevron-right accordion-icon cb-node-icon"></i>
                    </div>
                </div>

                <div class="accordion-content">
                    <div class="accordion-body subtemas-container"></div>
                </div>
            `;

            temaWrapper.querySelector(".btn-export-tema").onclick = async e => {
                e.stopPropagation();
                exportarTemaWord(tema);
            };

            const triggerTema = temaWrapper.querySelector('.accordion-trigger');
            const contentTema = temaWrapper.querySelector('.accordion-content');
            const bodyTema = temaWrapper.querySelector('.subtemas-container');
            bodyTema.dataset.temaId = tema.id;

            // RESTAURAR ESTADO
            let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");

            if (abiertosTemas.includes(tema.id)) {
                temaWrapper.classList.add("open");
                contentTema.style.height = "auto";
            } else {
                contentTema.style.height = "0px";
            }

            /* ---------------------------
                TOGGLE TEMA — MULTI-OPEN
            --------------------------- */
            triggerTema.addEventListener("click", e => {
                if (e.target.closest(".btn-add-subtema") ||
                    e.target.closest(".btn-edit-tema") ||
                    e.target.closest(".btn-delete-tema") ||
                    e.target.closest(".btn-duplicate-tema")) return;

                const isOpen = temaWrapper.classList.contains("open");

                if (!isOpen) {
                    temaWrapper.classList.add("open");
                    contentTema.style.height = "auto";

                    // Añadir a lista de temas abiertos
                    let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
                    if (!abiertosTemas.includes(tema.id)) abiertosTemas.push(tema.id);
                    localStorage.setItem("temasAbiertos", JSON.stringify(abiertosTemas));

                } else {
                    temaWrapper.classList.remove("open");
                    contentTema.style.height = "0px";

                    // Quitar de lista de temas abiertos
                    let abiertosTemas = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
                    abiertosTemas = abiertosTemas.filter(x => x !== tema.id);
                    localStorage.setItem("temasAbiertos", JSON.stringify(abiertosTemas));
                }
            });

            /* ---------------------------
                ACCIONES TEMA
            --------------------------- */
            temaWrapper.querySelector(".btn-edit-tema").onclick = async () => {
                const modalHTML = `
                    <div id="modalEditTema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                        <div class="bg-white rounded-lg p-6 w-full max-w-md">
                            <h3 class="text-lg font-semibold mb-4">Editar Tema</h3>
                            <input 
                                type="text" 
                                id="inputEditTema" 
                                placeholder="Nuevo nombre del tema"
                                class="w-full p-2 border border-gray-300 rounded mb-4"
                                value="${tema.nombre}"
                            >
                            <div class="flex justify-end gap-2">
                                <button 
                                    id="btnCancelarEditTema"
                                    class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    id="btnConfirmarEditTema"
                                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                const existingModal = document.getElementById("modalEditTema");
                if (existingModal) existingModal.remove();
                
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                
                const modal = document.getElementById("modalEditTema");
                const input = document.getElementById("inputEditTema");
                const btnCancelar = document.getElementById("btnCancelarEditTema");
                const btnConfirmar = document.getElementById("btnConfirmarEditTema");
                
                modal.classList.remove("hidden");
                modal.classList.add("flex");
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
                
                const nuevoNombre = await new Promise((resolve) => {
                    const limpiar = () => {
                        btnConfirmar.onclick = null;
                        btnCancelar.onclick = null;
                    };
                    
                    btnConfirmar.onclick = () => {
                        const valor = input.value.trim();
                        limpiar();
                        modal.classList.add("hidden");
                        resolve(valor);
                    };
                    
                    btnCancelar.onclick = () => {
                        limpiar();
                        modal.classList.add("hidden");
                        resolve(null);
                    };
                    
                    input.onkeypress = (e) => {
                        if (e.key === 'Enter') btnConfirmar.click();
                    };
                    
                    modal.onkeydown = (e) => {
                        if (e.key === 'Escape') btnCancelar.click();
                    };
                });
                
                setTimeout(() => modal.remove(), 300);
                
                if (!nuevoNombre) return;
                tema.nombre = nuevoNombre.trim();
                guardarCursoFirebase();
                renderTemas();
            };

            temaWrapper.querySelector(".btn-delete-tema").onclick = () => {
                if (!confirm("¿Eliminar tema completo?")) return;
                curso.temas = curso.temas.filter(t => t.id !== tema.id);
                guardarCursoFirebase();
                renderTemas();
            };

            temaWrapper.querySelector(".btn-duplicate-tema").onclick = () => {
                duplicarTema(tema);
            };

            temaWrapper.querySelector(".btn-add-subtema").onclick = () => addSubtema(tema);

            if (!USE_SORTABLE_SIDEBAR) {
                /* =====================================================
                        DRAG & DROP — SUBTEMAS (fallback nativo)
                ===================================================== */
                temaWrapper.addEventListener("dragover", e => {
                    e.preventDefault();
                    temaWrapper.classList.add("drop-target");
                });

                temaWrapper.addEventListener("dragleave", () => {
                    temaWrapper.classList.remove("drop-target");
                });

                temaWrapper.addEventListener("drop", async e => {
                    e.preventDefault();
                    temaWrapper.classList.remove("drop-target");

                    const subtemaId = e.dataTransfer.getData("subtemaId");
                    const temaIdOrigen = e.dataTransfer.getData("temaIdOrigen");
                    const temaIdDestino = tema.id;

                    if (!subtemaId || temaIdOrigen === temaIdDestino) return;

                    moverSubtema(temaIdOrigen, temaIdDestino, subtemaId);

                    await guardarCursoFirebase();
                    renderTemas();
                });
            }

            /* =====================================================
                        SUBTEMAS
            ===================================================== */
            tema.subtemas.forEach(sub => {
                const subAcc = document.createElement("div");
                subAcc.className = "accordion pl-4 subtema-draggable";
                subAcc.dataset.id = sub.id;

                const esSubtemaActivo = sub.id === subtemaAbierto;
                const contieneModuloActivo = (sub.modulosIds || []).includes(moduloActivo);

                subAcc.innerHTML = `
                    <div class="accordion-trigger flex items-center gap-2 ${esSubtemaActivo || contieneModuloActivo ? 'subtema-activo' : ''}">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-file cb-node-icon"></i>
                            <span class="${esSubtemaActivo ? 'font-semibold' : ''}">${sub.nombre}</span>
                        </div>

                        <div class="flex items-center gap-2">
                            <button class="icon-btn p-1 btn-add-modulo-subtema" title="Añadir módulo" aria-label="Añadir módulo">
                                <i class="fas fa-plus"></i>
                            </button>
                            <i class="fas fa-copy cursor-pointer cb-action-icon btn-duplicate-subtema"></i>
                            <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-subtema"></i>
                            <i class="fas fa-trash cursor-pointer cb-action-icon btn-delete-subtema"></i>
                            <i class="fas fa-chevron-right accordion-icon cb-node-icon"></i>
                        </div>
                    </div>

                    <div class="accordion-content">
                        <div class="accordion-body modulos-container"></div>
                    </div>
                `;

                const subTrigger = subAcc.querySelector(".accordion-trigger");
                const subContent = subAcc.querySelector(".accordion-content");
                const subBody = subAcc.querySelector(".modulos-container");


                    const modulosContainer = subAcc.querySelector(".modulos-container");
    
                    if (modulosContainer) {
                        modulosContainer.addEventListener("dragover", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            modulosContainer.classList.add("drop-target");
                        });

                        modulosContainer.addEventListener("dragleave", (e) => {
                            e.stopPropagation();
                            modulosContainer.classList.remove("drop-target");
                        });

                        modulosContainer.addEventListener("drop", async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            modulosContainer.classList.remove("drop-target");

                            const moduloId = e.dataTransfer.getData("moduloId");
                            const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                            const subtemaIdDestino = sub.id;
                            const isReorder = e.dataTransfer.getData("isReorder") === "true";

                            if (!moduloId) return;


                            // ================================================
                            // 1. REORDENAR MÓDULO EN EL MISMO SUBTEMA
                            // ================================================
                            if (isReorder && subtemaIdOrigen === subtemaIdDestino) {
                                const originalIndex = Number(e.dataTransfer.getData("originalIndex"));
                                
                                // El elemento exacto donde cayó el drop
                                const targetItem = e.target.closest(".module-draggable");
                                
                                // Si no hay destino válido, poner al final
                                const targetIndex = targetItem 
                                    ? [...modulosContainer.querySelectorAll(".module-draggable")].indexOf(targetItem)
                                    : modulosContainer.querySelectorAll(".module-draggable").length;
                                
                                // Validar rango
                                if (targetIndex >= 0 && originalIndex >= 0 && originalIndex !== targetIndex) {
                                    await reordenarModulo(subtemaIdDestino, originalIndex, targetIndex);
                                    return;
                                }
                            }

                            // ================================================
                            // 2. MOVER ENTRE SUBTEMAS DISTINTOS
                            // ================================================
                            if (subtemaIdOrigen !== subtemaIdDestino) {
                                await moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId);
                                return;
                            }
                        });
                    }


                /* =====================================================
                      DROPZONE — SOLO PARA MÓDULOS (MEJORADO)
                ===================================================== */
                subBody.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    subBody.classList.add("drop-target");
                });

                subBody.addEventListener("dragleave", (e) => {
                    e.stopPropagation();
                    subBody.classList.remove("drop-target");
                });

                subBody.addEventListener("drop", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    subBody.classList.remove("drop-target");

                    const moduloId = e.dataTransfer.getData("moduloId");
                    const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                    const subtemaIdDestino = sub.id;
                    const isReorder = e.dataTransfer.getData("isReorder") === "true";

                    if (!moduloId) return;


                    // REORDENAR EN EL MISMO SUBTEMA
                    if (isReorder && subtemaIdOrigen === subtemaIdDestino) {
                        const originalIndex = parseInt(e.dataTransfer.getData("originalIndex"));
                        const targetItem = e.target.closest(".module-draggable");
                        
                        // Calcular nueva posición
                        let targetIndex = sub.modulosIds.length - 1; // Por defecto al final
                        if (targetItem) {
                            const targetModId = targetItem.dataset.moduloId;
                            targetIndex = sub.modulosIds.indexOf(targetModId);
                            if (targetIndex === -1) targetIndex = sub.modulosIds.length - 1;
                        }
                        
                        // Validar índices
                        if (originalIndex >= 0 && targetIndex >= 0 && originalIndex !== targetIndex) {
                            await reordenarModulo(subtemaIdDestino, originalIndex, targetIndex);
                        }
                        return;
                    }

                    // MOVER A OTRO SUBTEMA
                    if (subtemaIdOrigen !== subtemaIdDestino) {
                        await moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId);
                        return;
                    }
                });





                /* -----------------------------------
                    DRAG SUBTEMA
                ----------------------------------- */
                if (!USE_SORTABLE_SIDEBAR) {
                    subAcc.draggable = true;

                    subAcc.addEventListener("dragstart", e => {
                        e.dataTransfer.setData("subtemaId", sub.id);
                        e.dataTransfer.setData("temaIdOrigen", tema.id);
                        subAcc.classList.add("dragging-subtema");
                    });

                    subAcc.addEventListener("dragend", () => {
                        subAcc.classList.remove("dragging-subtema");
                    });
                }

                /* -----------------------------------
                    RESTAURAR ESTADO
                ----------------------------------- */
                let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                if (abiertos.includes(sub.id)) {
                    subAcc.classList.add("open");
                    subContent.style.height = "auto";
                } else {
                    subContent.style.height = "0px";
                }

                /* TOGGLE SUBTEMA */
                subTrigger.addEventListener("click", e => {
                if (e.target.closest(".btn-add-modulo-subtema")) return;
                if (e.target.closest(".btn-duplicate-subtema") ||
                    e.target.closest(".btn-edit-subtema") ||
                    e.target.closest(".btn-delete-subtema")) return;

                const isOpen = subAcc.classList.contains("open");

                if (!isOpen) {
                    subAcc.classList.add("open");
                    subContent.style.height = subBody.scrollHeight + "px";

                    // ➕ AGREGAR a lista de subtemas abiertos
                    let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                    if (!abiertos.includes(sub.id)) abiertos.push(sub.id);
                    localStorage.setItem("subtemasAbiertos", JSON.stringify(abiertos));

                } else {
                    subAcc.classList.remove("open");
                    subContent.style.height = "0px";

                    // ➖ QUITAR de lista de subtemas abiertos
                    let abiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
                    abiertos = abiertos.filter(x => x !== sub.id);
                    localStorage.setItem("subtemasAbiertos", JSON.stringify(abiertos));
                }

                subtemaActivo = sub;
                temaActivo = tema;
                
                // 🔥 CORRECCIÓN: Verificar permisos antes de cargar
                const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
                const puedeEditar = cursoActual?.esPropio || cursoActual?.permisos?.editar === true;
                
                // Cargar subtema siempre, pero en modo lectura si no tiene permisos
                cargarSubtema(sub, null, !puedeEditar);
                });

                const btnAddModuloSubtema = subAcc.querySelector(".btn-add-modulo-subtema");
                if (btnAddModuloSubtema) {
                    btnAddModuloSubtema.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        mostrarSelectorModulo(sub);
                    };
                }


                /* ---------
                    CRUD SUBTEMA
                --------- */
                subAcc.querySelector(".btn-edit-subtema").onclick = async e => {
                    e.stopPropagation();
                    
                    const modalHTML = `
                        <div id="modalEditSubtema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                            <div class="bg-white rounded-lg p-6 w-full max-w-md">
                                <h3 class="text-lg font-semibold mb-4">Editar Subtema</h3>
                                <input 
                                    type="text" 
                                    id="inputEditSubtema" 
                                    placeholder="Nuevo nombre del subtema"
                                    class="w-full p-2 border border-gray-300 rounded mb-4"
                                    value="${sub.nombre}"
                                >
                                <div class="flex justify-end gap-2">
                                    <button 
                                        id="btnCancelarEditSubtema"
                                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        id="btnConfirmarEditSubtema"
                                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    const existingModal = document.getElementById("modalEditSubtema");
                    if (existingModal) existingModal.remove();
                    
                    document.body.insertAdjacentHTML('beforeend', modalHTML);
                    
                    const modal = document.getElementById("modalEditSubtema");
                    const input = document.getElementById("inputEditSubtema");
                    const btnCancelar = document.getElementById("btnCancelarEditSubtema");
                    const btnConfirmar = document.getElementById("btnConfirmarEditSubtema");
                    
                    modal.classList.remove("hidden");
                    modal.classList.add("flex");
                    setTimeout(() => {
                        input.focus();
                        input.select();
                    }, 100);
                    
                    const nuevoNombre = await new Promise((resolve) => {
                        const limpiar = () => {
                            btnConfirmar.onclick = null;
                            btnCancelar.onclick = null;
                        };
                        
                        btnConfirmar.onclick = () => {
                            const valor = input.value.trim();
                            limpiar();
                            modal.classList.add("hidden");
                            resolve(valor);
                        };
                        
                        btnCancelar.onclick = () => {
                            limpiar();
                            modal.classList.add("hidden");
                            resolve(null);
                        };
                        
                        input.onkeypress = (e) => {
                            if (e.key === 'Enter') btnConfirmar.click();
                        };
                        
                        modal.onkeydown = (e) => {
                            if (e.key === 'Escape') btnCancelar.click();
                        };
                    });
                    
                    setTimeout(() => modal.remove(), 300);
                    
                    if (!nuevoNombre) return;
                    sub.nombre = nuevoNombre.trim();
                    guardarCursoFirebase();
                    renderTemas();
                };

                subAcc.querySelector(".btn-delete-subtema").onclick = e => {
                    e.stopPropagation();
                    if (!confirm("¿Eliminar subtema?")) return;
                    tema.subtemas = tema.subtemas.filter(s => s.id !== sub.id);
                    guardarCursoFirebase();
                    renderTemas();
                };

                subAcc.querySelector(".btn-duplicate-subtema").onclick = e => {
                    e.stopPropagation();
                    duplicarSubtema(tema, sub);
                };

                /* =====================================================
                        MÓDULOS (MEJORADO)
                ===================================================== */
/* =====================================================
                        MÓDULOS (MEJORADO)
==================================================== */
        if (!sub.modulosIds || sub.modulosIds.length === 0) {
            subBody.innerHTML = `<p class="text-gray-400 text-xs">— No hay módulos —</p>`;
            } else {
                // Crear contenedor con clase especial para drag and drop
                subBody.classList.add('modulos-container-dnd');
                
                // Usar Promise.all para cargar módulos en paralelo
                const promesasModulos = sub.modulosIds.map(async (modId, index) => {
                    try {
                        // IMPORTANTE: Construir el ID compuesto para buscar el módulo
                        let idParaBuscar = modId;
                        
                        // Si el ID NO contiene guión bajo, significa que es solo el ID interno
                        // y necesitamos construir el ID compuesto: curso.id_modId
                        if (!modId.includes('_')) {
                            idParaBuscar = `${curso.id}_${modId}`;
                        }
                        
                        const mod = await obtenerModulo(idParaBuscar);
                        if (!mod) {
                            // Intentar con el ID original también, por compatibilidad
                            const modAlt = await obtenerModulo(modId);
                            if (!modAlt) {
                                return null;
                            }
                            if (modAlt.archivado && !mostrarModulosArchivados) return null;
                            return modAlt;
                        }

                        if (mod.archivado && !mostrarModulosArchivados) return null;

                        const esModuloActivo = moduloActivoExiste && modId === moduloActivo;

                        const li = document.createElement("div");
                        li.className = `py-1 text-xs hover:bg-gray-50 flex items-center justify-between cursor-pointer draggable-modulo module-draggable ${
                            esModuloActivo ? 'modulo-activo highlight-pulse' : ''
                        }`;
                        li.dataset.moduloId = modId;
                        li.dataset.index = index; // Añadir índice para referencia
                        li.draggable = true;

                        li.innerHTML = `
                            <div class="flex items-center gap-2 flex-1 modulo-select">
                                <i class="fas fa-grip-vertical cb-node-icon cb-module-grip mr-1 cursor-grab handle-drag" title="Arrastrar para reordenar"></i>
                                <i class="fas ${getModuloIcon(mod?.tipo)} cb-node-icon cb-module-kind-icon ${esModuloActivo ? 'is-active' : ''}"></i>
                                <span class="modulo-nombre-wrap">
                                <span class="modulo-nombre ${esModuloActivo ? 'font-semibold' : ''}">
                                    ${mod?.nombre || "Módulo"}
                                </span>
                                </span>
                                ${mod?.archivado ? '<span class="text-[10px] text-amber-600 ml-2">(archivado)</span>' : ''}
                                <span class="text-gray-400 text-[10px] ml-2"></span>
                            </div>

                            <div class="flex items-center gap-2 text-[11px] modulo-actions">
                                <i class="fas fa-copy cursor-pointer cb-action-icon btn-duplicate-modulo"></i>
                                <i class="fas fa-pen cursor-pointer cb-action-icon btn-edit-modulo"></i>
                                <button type="button"
                                        class="cb-action-icon btn-delete-modulo"
                                        title="Eliminar módulo"
                                        aria-label="Eliminar módulo"
                                        data-mc-action="eliminar-modulo"
                                        data-mc-modulo-id="${escapeHtml(modId)}">
                                    <i class="fas fa-trash cursor-pointer"></i>
                                </button>
                            </div>
                        `;

                        /* =====================================================
                            DRAG & DROP PARA REORDENAR (DENTRO DEL MISMO SUBTEMA)
                        ===================================================== */
                        li.addEventListener("dragstart", e => {
                            // Usar el ID normalizado
                            const idNormalizado = normalizarIdModulo(modId, false);
                            
                            e.dataTransfer.setData("moduloId", idNormalizado);
                            e.dataTransfer.setData("subtemaIdOrigen", sub.id);
                            e.dataTransfer.setData("isReorder", "true");
                            e.dataTransfer.setData("originalIndex", index.toString());
                            e.dataTransfer.effectAllowed = "move";
                            
                            li.classList.add("modulo-arrastrando");
                        });


                        li.addEventListener("dragover", e => {
                            e.preventDefault();
                            // Solo mostrar efecto si es del mismo subtema
                            if (e.dataTransfer.getData("subtemaIdOrigen") === sub.id) {
                                li.classList.add("drag-over");
                            }
                        });

                        li.addEventListener("dragleave", () => {
                            li.classList.remove("drag-over");
                        });

                        li.addEventListener("dragend", () => {
                            li.classList.remove("modulo-arrastrando", "drag-over");
                            // Limpiar todas las clases drag-over
                            subBody.querySelectorAll('.drag-over').forEach(el => {
                                el.classList.remove('drag-over');
                            });
                        });

                        li.addEventListener("drop", async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const moduloId = e.dataTransfer.getData("moduloId");
                            const subtemaIdOrigen = e.dataTransfer.getData("subtemaIdOrigen");
                            const isReorder = e.dataTransfer.getData("isReorder") === "true";
                            
                            // Si es reordenamiento dentro del mismo subtema
                            if (isReorder && subtemaIdOrigen === sub.id) {
                                const originalIndex = parseInt(e.dataTransfer.getData("originalIndex"));
                                const targetIndex = parseInt(li.dataset.index);
                                
                                if (originalIndex !== targetIndex) {
                                    await reordenarModulo(sub.id, originalIndex, targetIndex);
                                }
                            }
                            
                            li.classList.remove("drag-over");
                        });

                        // SELECT MODULO (resto del código igual...)
                        li.querySelector(".modulo-select").onclick = e => {
                            e.stopPropagation();

                            // limpiar anteriores
                            document.querySelectorAll("[data-modulo-id]").forEach(m => {
                                m.classList.remove("modulo-activo", "highlight-pulse");
                            });

                            // marcar visualmente
                            li.classList.add("modulo-activo", "highlight-pulse");

                            // GUARDAR EL ID REAL DEL MÓDULO
                            localStorage.setItem("moduloActivo", modId);

                            // actualizar globales
                            subtemaActivo = sub;
                            temaActivo = tema;

                            // cargar en editor
                            cargarSubtema(sub, modId);
                        };

                        /* DUPLICAR MODULO */
                        li.querySelector(".btn-duplicate-modulo").onclick = async e => {
                            e.stopPropagation();

                            // Construir ID compuesto para buscar
                            let idParaBuscarOriginal = modId;
                            if (!modId.includes('_')) {
                                idParaBuscarOriginal = `${curso.id}_${modId}`;
                            }
                            
                            const original = await obtenerModulo(idParaBuscarOriginal);
                            if (!original) {
                                alert("Error: módulo original no encontrado.");
                                return;
                            }

                            const nuevoId = crypto.randomUUID();

                            const nuevoModulo = JSON.parse(JSON.stringify(original));
                            nuevoModulo.id = nuevoId;
                            nuevoModulo.nombre = original.nombre + " (copia)";
                            nuevoModulo.creado = Date.now();
                            nuevoModulo.actualizado = Date.now();

                            // IMPORTANTE: Guardar con ID compuesto
                            await guardarModulo(nuevoId, nuevoModulo, curso.id);

                            if (!sub.modulosIds) sub.modulosIds = [];
                            // Guardar solo el ID interno en el array
                            sub.modulosIds.push(nuevoId);

                            await guardarCursoFirebase();
                            localStorage.setItem("moduloActivo", nuevoId);
                            renderTemas();
                            const subtemaActual = obtenerSubtemaActualDesdeCurso(sub.id) || sub;
                            await cargarSubtema(subtemaActual, nuevoId);
                        };


                        /* EDITAR MODULO */
                        li.querySelector(".btn-edit-modulo").onclick = async e => {
                            e.stopPropagation();

                            const modalHTML = `
                                <div id="modalEditModulo" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
                                    <div class="bg-white rounded-lg p-6 w-full max-w-md">
                                        <h3 class="text-lg font-semibold mb-4">Editar Módulo</h3>
                                        <input 
                                            type="text" 
                                            id="inputEditModulo" 
                                            placeholder="Nuevo nombre del módulo"
                                            class="w-full p-2 border border-gray-300 rounded mb-4"
                                            value="${mod.nombre}"
                                        >
                                        <div class="flex justify-end gap-2">
                                            <button 
                                                id="btnCancelarEditModulo"
                                                class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                            >
                                                Cancelar
                                            </button>
                                            <button 
                                                id="btnConfirmarEditModulo"
                                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;

                            const existingModal = document.getElementById("modalEditModulo");
                            if (existingModal) existingModal.remove();
                            document.body.insertAdjacentHTML('beforeend', modalHTML);

                            const modal = document.getElementById("modalEditModulo");
                            const input = document.getElementById("inputEditModulo");
                            const btnCancelar = document.getElementById("btnCancelarEditModulo");
                            const btnConfirmar = document.getElementById("btnConfirmarEditModulo");

                            modal.classList.remove("hidden");
                            modal.classList.add("flex");
                            setTimeout(() => {
                                input.focus();
                                input.select();
                            }, 100);

                            const nuevoNombre = await new Promise(resolve => {
                                const limpiar = () => {
                                    btnConfirmar.onclick = null;
                                    btnCancelar.onclick = null;
                                };

                                btnConfirmar.onclick = () => {
                                    const valor = input.value.trim();
                                    limpiar();
                                    modal.classList.add("hidden");
                                    resolve(valor);
                                };

                                btnCancelar.onclick = () => {
                                    limpiar();
                                    modal.classList.add("hidden");
                                    resolve(null);
                                };
                            });

                            setTimeout(() => modal.remove(), 300);

                            if (!nuevoNombre) return;

                            await guardarModulo(mod.id, { nombre: nuevoNombre.trim() });
                            renderTemas();
                        };

                        return li;
                    } catch (error) {
                        return null;
                    }
                });

                // Esperar a que todos los módulos se carguen
                Promise.all(promesasModulos).then(elementos => {
                    let agregados = 0;
                    elementos.forEach(li => {
                        if (li) subBody.appendChild(li);
                        if (li) agregados += 1;
                    });
                    if (agregados === 0) {
                        subBody.innerHTML = `<p class="text-gray-400 text-xs">— No hay módulos —</p>`;
                    }
                    
                    // 🔥 Ajustar altura del accordion después de cargar módulos
                    if (subAcc.classList.contains("open")) {
                        setTimeout(() => {
                            subContent.style.height = subBody.scrollHeight + "px";
                        }, 50);
                    }
                });
            }

                bodyTema.appendChild(subAcc);
            });

            listaTemas.appendChild(temaWrapper);
        });

        if (USE_SORTABLE_SIDEBAR) {
            inicializarSidebarSortable();
        }
    } catch (error) {
        alert("Error al renderizar los temas. Por favor, recarga la página.");
    }
}

document.querySelectorAll(".tema-dropzone").forEach(temaEl => {
    temaEl.draggable = true;

    temaEl.addEventListener("dragstart", e => {
        e.dataTransfer.setData("temaId", temaEl.dataset.temaId);
        temaEl.classList.add("tema-arrastrando");
    });

    temaEl.addEventListener("dragend", () => {
        temaEl.classList.remove("tema-arrastrando");
    });

    temaEl.addEventListener("drop", e => {
        const temaIdOrigen = e.dataTransfer.getData("temaId");
        const temaIdDestino = temaEl.dataset.temaId;

        if (!temaIdOrigen || temaIdOrigen === temaIdDestino) return;

        moverTema(temaIdOrigen, temaIdDestino);
        guardarCursoFirebase();
        renderTemas();
    });
});


/* ================================================
   DROPZONE GLOBAL PARA TEMAS
================================================ */
document.querySelectorAll(".tema-dropzone").forEach(drop => {
    drop.addEventListener("dragover", e => {
        e.preventDefault();
        drop.classList.add("drop-target");
    });

    drop.addEventListener("dragleave", () => {
        drop.classList.remove("drop-target");
    });

    drop.addEventListener("drop", async e => {
        e.preventDefault();
        drop.classList.remove("drop-target");

        const temaDestino = drop.dataset.temaId;

        const moduloId = e.dataTransfer.getData("moduloId");
        const subtemaId = e.dataTransfer.getData("subtemaId");
        const temaOrigen = e.dataTransfer.getData("temaIdOrigen");

        // ============================
        // 1. MOVER SUBTEMA ENTRE TEMAS
        // ============================
        if (subtemaId) {
            moverSubtema(temaOrigen, temaDestino, subtemaId);
            await guardarCursoFirebase();
            renderTemas();
            return;
        }

        // ============================
        // 2. MOVER MÓDULO A ÚLTIMO SUBTEMA DEL TEMA
        // ============================
        if (moduloId) {
            const tema = curso.temas.find(t => t.id === temaDestino);

            if (tema.subtemas.length === 0) return alert("Este tema no tiene subtemas");

            const ultimoSubtema = tema.subtemas[tema.subtemas.length - 1];

            await moverModulo(
                e.dataTransfer.getData("subtemaIdOrigen"),
                ultimoSubtema.id,
                moduloId
            );

            return;
        }
    });
});


/* ==========================================================
   FUNCIONES PARA REORDENAR MÓDULOS
========================================================== */

// Función principal para reordenar módulos dentro de un subtema
async function reordenarModulo(subtemaId, indiceOrigen, indiceDestino) {
    try {
        
        // Encontrar el subtema
        let subtemaEncontrado = null;
        
        for (const t of curso.temas) {
            for (const s of t.subtemas) {
                if (s.id === subtemaId) {
                    subtemaEncontrado = s;
                    break;
                }
            }
            if (subtemaEncontrado) break;
        }
        
        if (!subtemaEncontrado) {
            return;
        }
        
        // Asegurar array
        if (!Array.isArray(subtemaEncontrado.modulosIds)) {
            subtemaEncontrado.modulosIds = [];
        }
        
        // Validar índices
        if (indiceOrigen < 0 || indiceOrigen >= subtemaEncontrado.modulosIds.length) {
            return;
        }
        
        if (indiceDestino < 0) indiceDestino = 0;
        if (indiceDestino > subtemaEncontrado.modulosIds.length) {
            indiceDestino = subtemaEncontrado.modulosIds.length;
        }
        
        // Reordenar
        const moduloMovido = subtemaEncontrado.modulosIds.splice(indiceOrigen, 1)[0];
        subtemaEncontrado.modulosIds.splice(indiceDestino, 0, moduloMovido);
        
        
        // Guardar
        await guardarCursoFirebase();
        
        // Actualizar UI
        renderTemas();
        
    } catch (error) {
        alert("Error al reordenar el módulo.");
    }
}


// Función para mover un módulo a una posición específica
async function moverModuloAPosicion(subtemaIdOrigen, subtemaIdDestino, moduloId, posicionDestino) {
    try {
        
        let subOrigen = null;
        let subDestino = null;
        
        // Buscar subtemas origen y destino
        curso.temas.forEach(t => {
            t.subtemas.forEach(s => {
                if (s.id === subtemaIdOrigen) subOrigen = s;
                if (s.id === subtemaIdDestino) subDestino = s;
            });
        });
        
        if (!subOrigen || !subDestino) {
            return;
        }
        
        // Asegurar arrays
        if (!Array.isArray(subOrigen.modulosIds)) subOrigen.modulosIds = [];
        if (!Array.isArray(subDestino.modulosIds)) subDestino.modulosIds = [];
        
        // Remover del origen
        const indexOrigen = subOrigen.modulosIds.indexOf(moduloId);
        if (indexOrigen === -1) {
            return;
        }
        
        subOrigen.modulosIds.splice(indexOrigen, 1);
        
        // Insertar en destino en la posición especificada
        const posicionFinal = Math.min(posicionDestino, subDestino.modulosIds.length);
        subDestino.modulosIds.splice(posicionFinal, 0, moduloId);
        
        // Actualizar referencia en Firestore
        await guardarModulo(moduloId, {
            subtemaId: subtemaIdDestino,
            cursoId: curso.id,
            actualizado: Date.now()
        });
        
        // Guardar curso
        await guardarCursoFirebase();
        
        // Actualizar UI
        renderTemas();
        
        // Si el módulo movido era el activo, actualizar
        const moduloActivoId = localStorage.getItem("moduloActivo");
        if (moduloActivoId === moduloId) {
            setTimeout(() => {
                cargarSubtema(subDestino, moduloId);
            }, 300);
        }
        
        
    } catch (error) {
        alert("Error al mover el módulo.");
    }
}


function moverTema(origen, destino) {
    const i1 = curso.temas.findIndex(t => t.id === origen);
    const i2 = curso.temas.findIndex(t => t.id === destino);

    if (i1 === -1 || i2 === -1) return;

    const temp = curso.temas[i1];
    curso.temas.splice(i1, 1);
    curso.temas.splice(i2, 0, temp);
}


/* ==========================================================
        MOVER SUBTEMA ENTRE TEMAS
========================================================== */
function moverSubtema(temaIdOrigen, temaIdDestino, subtemaId) {
    let temaOrigen = curso.temas.find(t => t.id === temaIdOrigen);
    let temaDestino = curso.temas.find(t => t.id === temaIdDestino);

    if (!temaOrigen || !temaDestino) return;

    const sub = temaOrigen.subtemas.find(s => s.id === subtemaId);

    if (!sub) return;

    // quitar de origen
    temaOrigen.subtemas = temaOrigen.subtemas.filter(s => s.id !== subtemaId);

    // agregar a destino
    temaDestino.subtemas.push(sub);
}

function moverSubtemaConPosicion(temaIdOrigen, temaIdDestino, subtemaId, indiceDestino) {
    const temaOrigen = curso.temas.find(t => t.id === temaIdOrigen);
    const temaDestino = curso.temas.find(t => t.id === temaIdDestino);
    if (!temaOrigen || !temaDestino) return false;

    const indiceOrigen = temaOrigen.subtemas.findIndex(s => s.id === subtemaId);
    if (indiceOrigen === -1) return false;

    const [subtema] = temaOrigen.subtemas.splice(indiceOrigen, 1);
    if (!subtema) return false;

    const destinoNormalizado = Math.max(0, Math.min(indiceDestino, temaDestino.subtemas.length));
    temaDestino.subtemas.splice(destinoNormalizado, 0, subtema);
    return true;
}


async function moverModulo(subtemaIdOrigen, subtemaIdDestino, moduloId) {
    try {
        
        // 1. BUSCAR SUBTEMAS ORIGEN Y DESTINO
        let subOrigen = null, subDestino = null;
        let temaOrigen = null, temaDestino = null;
        
        for (const t of curso.temas) {
            for (const s of t.subtemas) {
                if (s.id === subtemaIdOrigen) {
                    subOrigen = s;
                    temaOrigen = t;
                }
                if (s.id === subtemaIdDestino) {
                    subDestino = s;
                    temaDestino = t;
                }
            }
        }
        
        if (!subOrigen || !subDestino) {
            alert("Error: No se encontraron los subtemas.");
            return;
        }
        
        // 2. BUSCAR EL MÓDULO EN EL ARRAY (manejar ambos formatos de ID)
        let moduloIndex = -1;
        let idEnArray = null;
        
        // Asegurar que exista el array de módulos
        if (!subOrigen.modulosIds) subOrigen.modulosIds = [];
        
        // Buscar el módulo en el array
        for (let i = 0; i < subOrigen.modulosIds.length; i++) {
            const idActual = subOrigen.modulosIds[i];
            
            // Comparación directa
            if (idActual === moduloId) {
                moduloIndex = i;
                idEnArray = idActual;
                break;
            }
            
            // Si moduloId es interno (sin guión) pero en array está compuesto
            if (!moduloId.includes('_') && idActual.includes('_')) {
                const partes = idActual.split('_');
                if (partes.length > 1 && partes[1] === moduloId) {
                    moduloIndex = i;
                    idEnArray = idActual;
                    break;
                }
            }
            
            // Si moduloId es compuesto pero en array está interno
            if (moduloId.includes('_') && !idActual.includes('_')) {
                const partesModulo = moduloId.split('_');
                if (partesModulo.length > 1 && partesModulo[1] === idActual) {
                    moduloIndex = i;
                    idEnArray = idActual;
                    break;
                }
            }
        }
        
        if (moduloIndex === -1) {
            return;
        }
        
        // 3. REMOVER DEL ORIGEN
        const moduloMovido = subOrigen.modulosIds.splice(moduloIndex, 1)[0];
        
        // 4. AGREGAR AL DESTINO
        if (!subDestino.modulosIds) subDestino.modulosIds = [];
        subDestino.modulosIds.push(moduloMovido);
        
        // 5. ACTUALIZAR EL DOCUMENTO EN FIRESTORE
        try {
            // Obtener datos del módulo
            const moduloData = await obtenerModulo(moduloMovido, curso.id);
            
            if (moduloData) {
                // Determinar el ID correcto para Firestore
                let idFirestore = moduloMovido;
                if (!moduloMovido.includes('_')) {
                    idFirestore = `${curso.id}_${moduloMovido}`;
                }
                
                // Actualizar el documento del módulo
                await updateDoc(doc(db, "moodleCourses", idFirestore), {
                    subtemaId: subtemaIdDestino,
                    cursoId: curso.id,
                    actualizado: Date.now()
                });
            }
        } catch (firestoreError) {
            // Continuar aunque falle la actualización individual, el curso se guardará completo
        }
        
        // 6. GUARDAR CAMBIOS DEL CURSO
        await guardarCursoFirebase();
        
        // 7. ACTUALIZAR UI COMPLETA
        renderTemas();
        
        // 8. CARGAR EL SUBTEMA DESTINO (opcional)
        if (subtemaActivo && subtemaActivo.id === subtemaIdDestino) {
            setTimeout(() => {
                cargarSubtema(subDestino);
            }, 300);
        }
        
        
    } catch (error) {
        alert("Error al mover el módulo: " + error.message);
    }
}




// ✅ NUEVA FUNCIÓN: Actualizar UI optimizada después de mover módulo
async function actualizarUIAfterMoverModulo(moduloId, subtemaIdOrigen, subtemaIdDestino) {
    
    // Guardar estados
    const temasAbiertos = JSON.parse(localStorage.getItem("temasAbiertos") || "[]");
    const subtemasAbiertos = JSON.parse(localStorage.getItem("subtemasAbiertos") || "[]");
    const moduloActivo = localStorage.getItem("moduloActivo");
    
    // Si es movimiento entre diferentes subtemas, hacer render completo
    if (subtemaIdOrigen !== subtemaIdDestino) {
        renderTemas();
        // Restaurar selección si este módulo era el activo
        if (moduloActivo && (moduloActivo === moduloId || 
            extraerIdInternoModulo(moduloId) === moduloActivo ||
            construirDocIdModulo(moduloId) === moduloActivo)) {
            setTimeout(() => {
                document.querySelectorAll(`[data-modulo-id]`).forEach(el => {
                    const elId = el.dataset.moduloId;
                    if (elId === moduloId || 
                        extraerIdInternoModulo(elId) === extraerIdInternoModulo(moduloId) ||
                        construirDocIdModulo(elId) === construirDocIdModulo(moduloId)) {
                        el.classList.add('modulo-activo', 'highlight-pulse');
                    }
                });
            }, 300);
        }
        return;
    }
    
    // Si es reordenamiento en el mismo subtema
    try {
        // Encontrar el subtema en el DOM
        const subtemaElement = document.querySelector(`[data-id="${subtemaIdOrigen}"]`);
        if (!subtemaElement) {
            renderTemas();
            return;
        }
        
        // Obtener contenedor de módulos
        const modulosContainer = subtemaElement.querySelector('.modulos-container');
        if (!modulosContainer) {
            renderTemas();
            return;
        }
        
        // Obtener todos los elementos de módulo
        const moduloElements = Array.from(modulosContainer.querySelectorAll('[data-modulo-id]'));
        
        // Crear nuevo array en el orden correcto
        const nuevoOrden = [];
        moduloElements.forEach(el => {
            nuevoOrden.push(el.dataset.moduloId);
        });
        
        // Actualizar el array en el curso
        const subtema = curso.temas.flatMap(t => t.subtemas).find(s => s.id === subtemaIdOrigen);
        if (subtema) {
            subtema.modulosIds = nuevoOrden;
            
            // Hacer un render suave manteniendo el estado abierto
            const subtemaAbierto = subtemaElement.classList.contains('open');
            const contenidoHeight = subtemaElement.querySelector('.accordion-content').scrollHeight;
            
            // Reconstruir solo los módulos de este subtema
            const nuevosModulosHTML = await generarHTMLModulos(subtema);
            modulosContainer.innerHTML = nuevosModulosHTML;
            
            // Restaurar estado abierto
            if (subtemaAbierto) {
                subtemaElement.classList.add('open');
                subtemaElement.querySelector('.accordion-content').style.height = `${contenidoHeight}px`;
            }
            
            // Restaurar selección
            if (moduloActivo) {
                moduloElements.forEach(el => {
                    if (el.dataset.moduloId === moduloActivo ||
                        extraerIdInternoModulo(el.dataset.moduloId) === moduloActivo ||
                        construirDocIdModulo(el.dataset.moduloId) === moduloActivo) {
                        el.classList.add('modulo-activo', 'highlight-pulse');
                    }
                });
            }
        }
        
    } catch (error) {
        renderTemas();
    }
    
    // Restaurar estados de acordeones
    setTimeout(() => {
        restaurarEstadosAcordeones(temasAbiertos, subtemasAbiertos);
    }, 50);
}


// Función auxiliar para actualizar contadores de módulos
function actualizarContadoresSubtema(subtemaId) {
    const subtemaElement = document.querySelector(`[data-id="${subtemaId}"]`);
    if (!subtemaElement) return;
    
    const contadorElement = subtemaElement.querySelector('.contador-modulos');
    if (contadorElement) {
        // Encontrar el subtema en la estructura del curso
        let subtema = null;
        curso.temas.forEach(t => {
            t.subtemas.forEach(s => {
                if (s.id === subtemaId) {
                    subtema = s;
                }
            });
        });
        
        if (subtema) {
            const count = subtema.modulosIds ? subtema.modulosIds.length : 0;
            contadorElement.textContent = `(${count})`;
        }
    }
}

// Función auxiliar para restaurar estados de acordeones
function restaurarEstadosAcordeones(temasAbiertos, subtemasAbiertos) {
    temasAbiertos.forEach(temaId => {
        const temaElement = document.querySelector(`[data-tema-id="${temaId}"]`);
        if (temaElement) {
            temaElement.classList.add('open');
            const content = temaElement.querySelector('.accordion-content');
            if (content) {
                content.style.height = 'auto';
            }
        }
    });
    
    subtemasAbiertos.forEach(subtemaId => {
        const subtemaElement = document.querySelector(`[data-id="${subtemaId}"]`);
        if (subtemaElement) {
            subtemaElement.classList.add('open');
            const content = subtemaElement.querySelector('.accordion-content');
            if (content) {
                content.style.height = 'auto';
            }
        }
    });
}




/* AÑADIR SUBTEMA */
async function addSubtema(tema) {
    // Crear el modal si no existe
    if (!document.getElementById("modalAddSubtema")) {
        crearModalSubtema();
    }

    const modal = document.getElementById("modalAddSubtema");
    const input = document.getElementById("inputNombreSubtema");
    const btnCancelar = document.getElementById("btnCancelarSubtema");
    const btnConfirmar = document.getElementById("btnConfirmarSubtema");

    // Resetear el input
    input.value = "";
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar el input
    setTimeout(() => input.focus(), 100);

    // Esperar a que el usuario confirme o cancele
    return new Promise((resolve) => {
        const limpiarEventos = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };

        const confirmar = async () => {
            const nombre = input.value.trim();
            if (!nombre) {
                input.classList.add("border-red-500");
                setTimeout(() => input.classList.remove("border-red-500"), 1000);
                return;
            }

            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");

            // Crear el subtema
            tema.subtemas.push({
                id: crypto.randomUUID(),
                nombre,
                instrucciones: "",
                contenidoGenerado: "",
                modulos: [],
                traducciones: [] 
            });

            await guardarCursoFirebase();
            localStorage.setItem("subtemaAbierto", tema.subtemas[tema.subtemas.length - 1].id);
            renderTemas();
            resolve(true);
        };

        const cancelar = () => {
            limpiarEventos();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            resolve(false);
        };

        btnConfirmar.onclick = confirmar;
        btnCancelar.onclick = cancelar;

        // También permitir Enter para confirmar
        input.onkeypress = (e) => {
            if (e.key === 'Enter') confirmar();
        };
        
        // Permitir Escape para cancelar
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') cancelar();
        };
    });
}

/* Función para crear el modal dinámicamente si no existe */
function crearModalSubtema() {
    const modalHTML = `
        <div id="modalAddSubtema" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
            <div class="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 class="text-lg font-semibold mb-4">Nuevo Subtema</h3>
                <input 
                    type="text" 
                    id="inputNombreSubtema" 
                    placeholder="Nombre del subtema"
                    class="w-full p-2 border border-gray-300 rounded mb-4"
                >
                <div class="flex justify-end gap-2">
                    <button 
                        id="btnCancelarSubtema"
                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancelar
                    </button>
                    <button 
                        id="btnConfirmarSubtema"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Crear
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}


async function duplicarTema(temaOriginal) {

    // 1. Copia profunda
    const nuevoTema = JSON.parse(JSON.stringify(temaOriginal));

    // 2. Nuevo ID
    nuevoTema.id = crypto.randomUUID();
    nuevoTema.nombre = nuevoTema.nombre + " (copia)";

    // 3. Regenerar IDs de subtemas y módulos
    nuevoTema.subtemas = nuevoTema.subtemas.map(st => {
        const nuevo = { ...st, id: crypto.randomUUID() };
        nuevo.modulos = (st.modulos || []).map(m => ({
            ...m,
            id: crypto.randomUUID()
        }));
        return nuevo;
    });

    // 4. Insertar después del original
    const index = curso.temas.indexOf(temaOriginal);
    curso.temas.splice(index + 1, 0, nuevoTema);

    // 5. Guardar
    await guardarCursoFirebase();

    // 6. Renderizar
    renderTemas();
}




function resolverSubtemaParaModulo(moduloId = "") {
    const cleanModuloId = String(moduloId || "").trim();
    const active = window.subtemaActivo || subtemaActivo || null;
    if (active?.id && (!cleanModuloId || (Array.isArray(active.modulosIds) && active.modulosIds.some((id) => {
        const cleanId = String(id || "").trim();
        return cleanId === cleanModuloId || cleanId === cleanModuloId.split("_").pop();
    })))) {
        return active;
    }

    if (!curso?.temas?.length || !cleanModuloId) return active;
    const cleanModuloIdShort = cleanModuloId.split("_").pop();
    for (const tema of curso.temas) {
        for (const sub of (tema?.subtemas || [])) {
            const ids = Array.isArray(sub?.modulosIds) ? sub.modulosIds : [];
            const found = ids.some((id) => {
                const cleanId = String(id || "").trim();
                return cleanId === cleanModuloId || cleanId === cleanModuloIdShort || cleanId.split("_").pop() === cleanModuloIdShort;
            });
            if (found) return sub;
        }
    }
    return active;
}

/* EDITAR SUBTEMA EN EL EDITOR */
async function cargarSubtema(subtema, moduloIdToScroll = null, modoLectura = false) {
    if (!subtema?.id) {
        throw new Error("No se pudo refrescar el subtema activo después de generar el módulo.");
    }
    // HACER SUBTEMA GLOBAL PARA OTROS ARCHIVOS
    subtemaActivo = subtema;
    window.subtemaActivo = subtema;
    // Guardar en localStorage
    localStorage.setItem("subtemaAbierto", subtema.id);
    
    // Buscar el tema padre y guardarlo también
    const temaPadre = curso.temas.find(t => 
        t.subtemas?.some(s => s.id === subtema.id)
    );

    if (temaPadre) {
        temaActivo = temaPadre;
        localStorage.setItem("temaAbierto", temaPadre.id);
        window.temaActivo = temaPadre;
    }

    // 🔥 CORRECCIÓN: Determinar si estamos en modo lectura
    const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
    
    // 🔥 IMPORTANTE: Para cursos duplicados, siempre deberían ser editables
    let puedeEditar = true;
    if (cursoActual) {
        puedeEditar = cursoActual.esPropio || cursoActual.permisos?.editar === true;
        
        // Verificar si es un curso duplicado (por el nombre o algún indicador)
        if (cursoActual.nombre && cursoActual.nombre.includes("(Copia)")) {
            puedeEditar = true; // Forzar modo edición para copias
        }
    }
    
    const esModoLectura = modoLectura || !puedeEditar;
    
    contenidoEditor.innerHTML = `
    <div class="flex items-center justify-between mb-6">
        <h2 class="text-sm font-semibold text-gray-900">${subtema.nombre}</h2>
        <div class="flex items-center gap-3">
            ${!esModoLectura ? `
                <button class="icon-btn" id="btnAddModulo" title="Añadir módulo">
                    <i class="fas fa-plus"></i>
                </button>
            ` : `
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                    <i class="fas fa-eye mr-1"></i>Solo lectura
                </span>
            `}
        </div>
    </div>

            <!-- Módulos -->
            <div class="mt-4">
                <label class="section-title">Módulos de este subtema</label>
                <div id="listaModulos" class="space-y-3 mt-3">
                    ${await renderModulosHTML(subtema, moduloIdToScroll, esModoLectura)}
                </div>
            </div>
        `;
    delete window.__forceRefreshModuloId;

    // Solo volver arriba si no se pidió ir a un módulo específico
    if (!moduloIdToScroll) {
        contenidoEditor.scrollTo({ top: 0, behavior: "auto" });
    }

    // 🔥 CORRECCIÓN: Agregar eventos de guardado para instrucciones y contenido generado
    if (!esModoLectura) {
        // Evento para guardar instrucciones
        const instruccionesDiv = document.getElementById("instruccionesSubtema");
        if (instruccionesDiv) {
            instruccionesDiv.addEventListener("blur", async (e) => {
                const contenido = e.target.innerHTML;
                // Limpiar el placeholder si existe
                if (contenido.includes('Sin instrucciones - haz clic para editar')) {
                    subtema.instrucciones = "";
                } else {
                    subtema.instrucciones = sanitizarHtmlEditorial(contenido);
                }
                await guardarCursoFirebase();
            });
            
            // También guardar al presionar Ctrl+Enter
            instruccionesDiv.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    const contenido = instruccionesDiv.innerHTML;
                    subtema.instrucciones = sanitizarHtmlEditorial(contenido);
                    await guardarCursoFirebase();
                    instruccionesDiv.blur();
                }
            });
        }

        // Evento para guardar contenido generado
        const resultadoDiv = document.getElementById("resultadoGenerado");
        if (resultadoDiv) {
            resultadoDiv.addEventListener("blur", async (e) => {
                subtema.contenidoGenerado = sanitizarHtmlEditorial(e.target.innerHTML);
                await guardarCursoFirebase();
            });
            
            resultadoDiv.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    subtema.contenidoGenerado = sanitizarHtmlEditorial(resultadoDiv.innerHTML);
                    await guardarCursoFirebase();
                    resultadoDiv.blur();
                }
            });
        }

        const btnEliminarResultadoGenerado = document.getElementById("btnEliminarResultadoGenerado");
        if (btnEliminarResultadoGenerado && resultadoDiv) {
            btnEliminarResultadoGenerado.addEventListener("click", async () => {
                subtema.contenidoGenerado = "";
                resultadoDiv.innerHTML = '<span class="text-muted-foreground text-xs">Sin contenido generado</span>';
                await guardarCursoFirebase();
                mostrarNotificacion("Contenido generado eliminado", "success");
            });
        }

        // NUEVO: Botón para abrir modal de instrucciones
        const btnInstrucciones = document.getElementById("btnInstruccionesSubtema");
        if (btnInstrucciones) {
            btnInstrucciones.addEventListener("click", () => {
                abrirModalInstruccionesSubtema(subtema);
            });
        }

    }

    // 🔥 CORRECCIÓN: Solo activar edición para módulos si no es modo lectura
    if (!esModoLectura) {
        setTimeout(() => {
            document.querySelectorAll('.contenido-editable').forEach(contenedor => {
                // Doble clic para activar/desactivar edición completa del módulo
                if (contenedor.dataset.moduloId) {
                    contenedor.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        const moduloId = this.dataset.moduloId;
                        
                        if (moduloEditandoCompleto === moduloId) {
                            desactivarEdicionModuloCompleto();
                        } else {
                            activarEdicionModuloCompleto(moduloId);
                        }
                    });

                    // Clic simple para seleccionar
                    contenedor.addEventListener('click', function(e) {
                        const moduloId = this.dataset.moduloId;
                        
                        if (moduloEditandoCompleto !== moduloId) {
                            document.querySelectorAll('.contenido-editable').forEach(el => {
                                el.classList.remove('modulo-seleccionado');
                            });
                            
                            this.classList.add('modulo-seleccionado');
                            localStorage.setItem("moduloActivo", moduloId);
                        }
                    });

                    // Guardado automático del contenido del módulo al editar.
                    if (!contenedor.dataset.autosaveBound) {
                        contenedor.dataset.autosaveBound = "1";
                        contenedor.dataset.lastSavedHtml = normalizarContenidoModuloPersistible(
                            sanitizeRichText(contenedor.innerHTML)
                        );

                        const guardarModuloDesdeContenedor = async (forzar = false) => {
                            const modId = contenedor.dataset.moduloId;
                            if (!modId) return;

                            const htmlCrudo = sanitizeRichText(contenedor.innerHTML);
                            const html = normalizarContenidoModuloPersistible(htmlCrudo);
                            const ultimo = contenedor.dataset.lastSavedHtml || "";
                            if (!forzar && html === ultimo) return;

                            try {
                                await guardarModulo(modId, { contenido: html });
                                contenedor.dataset.lastSavedHtml = html;
                                contenedor.innerHTML = html;

                                const spinner = document.getElementById(`spinner-${modId}`);
                                if (spinner) {
                                    spinner.classList.remove("hidden");
                                    spinner.innerHTML = `<span class="text-green-600 text-xs">✓ Guardado</span>`;
                                    setTimeout(() => spinner.classList.add("hidden"), 1200);
                                }
                            } catch (_) {
                                const spinner = document.getElementById(`spinner-${modId}`);
                                if (spinner) {
                                    spinner.classList.remove("hidden");
                                    spinner.innerHTML = `<span class="text-red-600 text-xs">✗ Error al guardar</span>`;
                                    setTimeout(() => spinner.classList.add("hidden"), 1800);
                                }
                            }
                        };

                        contenedor.addEventListener("input", () => {
                            const modId = contenedor.dataset.moduloId;
                            if (!modId) return;

                            const prevTimer = moduloAutosaveTimers.get(modId);
                            if (prevTimer) clearTimeout(prevTimer);

                            const timer = setTimeout(() => {
                                guardarModuloDesdeContenedor(false);
                                moduloAutosaveTimers.delete(modId);
                            }, 900);

                            moduloAutosaveTimers.set(modId, timer);
                        });

                        contenedor.addEventListener("blur", () => {
                            const modId = contenedor.dataset.moduloId;
                            if (modId && moduloAutosaveTimers.has(modId)) {
                                clearTimeout(moduloAutosaveTimers.get(modId));
                                moduloAutosaveTimers.delete(modId);
                            }
                            guardarModuloDesdeContenedor(true);
                        });

                        contenedor.addEventListener("keydown", (e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                                e.preventDefault();
                                guardarModuloDesdeContenedor(true);
                            }
                        });
                    }
                }
            });
        }, 100);
    }

    // Scroll rápido y robusto al módulo objetivo (id interno o compuesto)
    if (moduloIdToScroll) {
        const scrollIds = [
            moduloIdToScroll,
            String(moduloIdToScroll).includes('_') ? String(moduloIdToScroll).split('_').pop() : null
        ].filter(Boolean);

        const desplazarModuloEnPanelEditor = (moduloDiv) => {
            const scrollHost = contenidoEditor.closest('main') || contenidoEditor.parentElement;
            if (!scrollHost || typeof scrollHost.scrollTo !== "function") {
                moduloDiv.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'nearest'
                });
                return;
            }

            const hostRect = scrollHost.getBoundingClientRect();
            const moduloRect = moduloDiv.getBoundingClientRect();
            const margenSuperior = 16;
            const nextTop = scrollHost.scrollTop + (moduloRect.top - hostRect.top) - margenSuperior;

            scrollHost.scrollTo({
                top: Math.max(0, nextTop),
                behavior: 'auto'
            });
        };

        const buscarYScroll = () => {
            for (const id of scrollIds) {
                const moduloDiv = document.getElementById(`modulo-${id}`);
                if (!moduloDiv) continue;

                localStorage.setItem("moduloActivo", id);
                desplazarModuloEnPanelEditor(moduloDiv);
                moduloDiv.classList.add('highlight-pulse');
                setTimeout(() => moduloDiv.classList.remove('highlight-pulse'), 900);
                return true;
            }
            return false;
        };

        // Intentar inmediatamente y luego en próximos frames por si aún no pintó el nodo
        if (!buscarYScroll()) {
            let intentos = 0;
            const maxIntentos = 12;
            const tick = () => {
                intentos += 1;
                if (buscarYScroll() || intentos >= maxIntentos) return;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
    }

    // 🔥 CORRECCIÓN: Solo habilitar botones si no es modo lectura
    if (!esModoLectura) {
        // Generar contenido - CORREGIR EL ERROR AQUÍ
        const btnGenerar = document.getElementById("btnGenerar");
if (btnGenerar) {
    btnGenerar.addEventListener("click", async () => {
        // Obtener los elementos necesarios del DOM
        const instruccionesDiv = document.getElementById("instruccionesSubtema");
        const resultadoDiv = document.getElementById("resultadoGenerado");
        const subtemaActual = window.subtemaActivo;
        
        if (!instruccionesDiv || !resultadoDiv || !subtemaActual) {
            alert("Error: No se pudo encontrar el contenido para generar. Asegúrate de tener un subtema seleccionado.");
            return;
        }
        
        // Obtener el curso actual para verificar permisos
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        
        // Verificar permisos
        if (cursoActual && !cursoActual.esPropio && !cursoActual.permisos?.editar) {
            alert("No tienes permisos para generar contenido en este curso.");
            return;
        }
        
        if (typeof generarContenidoGemini === 'function') {
            // Pasar los elementos necesarios como parámetros
            await generarContenidoGemini({
                instruccionesDiv: instruccionesDiv,
                resultadoDiv: resultadoDiv,
                subtema: subtemaActual,
                cursoId: cursoDocId,
                userId: currentUserId
            });
        } else {
            alert("Error: No se puede generar contenido en este momento.");
        }
    });
}


        // Traducir subtema
        const btnTraducir = document.getElementById("btnTraducirSubtema");
        if (btnTraducir) {
            btnTraducir.onclick = () => {
                window.__subtemaTraduciendo = subtema;
                window.renderListadoTraduccionesSubtema(subtema);

                const modal = document.getElementById("modalTraducirSubtema");
                const select = document.getElementById("selectIdiomaSubtema");
                const contPrev = document.getElementById("contenidoTraduccionSubtema");

                select.value = "";
                contPrev.innerHTML = `<p class="text-muted-foreground text-sm">Aquí aparecerá la traducción del contenido generado.</p>`;

                modal.classList.remove("hidden");
                modal.classList.add("flex");
            };
        }

        // Añadir módulo
        const btnAddModulo = document.getElementById("btnAddModulo");
        if (btnAddModulo) {
            btnAddModulo.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                mostrarSelectorModulo(subtema);
            });
        }
    }

    // Activar sistema de edición solo si no es modo lectura
    if (!esModoLectura) {
        setTimeout(() => activarAccionesEnParrafos(), 50);
        setTimeout(() => iniciarTourBotonesModuloSiAplica(), 280);
    }
}

/* ============================================================
   MODAL PARA INSTRUCCIONES DEL SUBTEMA
============================================================ */

async function abrirModalInstruccionesSubtema(subtema) {
    // Crear modal si no existe
    if (!document.getElementById("modalInstruccionesSubtema")) {
        crearModalInstruccionesSubtema();
    }
    
    const modal = document.getElementById("modalInstruccionesSubtema");
    const tituloModal = document.getElementById("tituloInstruccionesSubtema");
    const instruccionesDiv = document.getElementById("instruccionesSubtema");
    const btnGuardar = document.getElementById("btnGuardarInstruccionesSubtema");
    
    // Configurar el modal
    tituloModal.textContent = `Instrucciones: ${subtema.nombre}`;
    
    // Cargar instrucciones actuales
    instruccionesDiv.innerHTML = sanitizarHtmlEditorialOMensajeVacio(
        subtema.instrucciones,
        '<p class="text-muted-foreground text-sm">Escribe las instrucciones para este subtema aquí...</p>'
    );
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar el contenido editable
    setTimeout(() => {
        if (instruccionesDiv.textContent.includes("Escribe las instrucciones")) {
            instruccionesDiv.focus();
            // Seleccionar todo para facilitar la edición
            const range = document.createRange();
            range.selectNodeContents(instruccionesDiv);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 100);
    
    // Configurar evento para guardar
    const guardarInstrucciones = async () => {
        const contenido = sanitizeRichText(instruccionesDiv.innerHTML);
        
        // Evitar guardar si es el placeholder
        if (contenido.includes("Escribe las instrucciones")) {
            subtema.instrucciones = "";
        } else {
            subtema.instrucciones = sanitizarHtmlEditorial(contenido);
        }
        
        await guardarCursoFirebase();
        
        // Cerrar modal
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        
        // Notificar
        mostrarNotificacion("✅ Instrucciones guardadas correctamente", 'success');
    };
    
    // Limpiar eventos previos
    btnGuardar.onclick = null;
    
    // Asignar nuevo evento
    btnGuardar.onclick = guardarInstrucciones;
    
    // También permitir Ctrl+Enter para guardar
    instruccionesDiv.onkeydown = (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            guardarInstrucciones();
        }
        
        // Escape para cancelar
        if (e.key === "Escape") {
            modal.classList.add("hidden");
            modal.classList.remove("flex");
        }
    };
}

function crearModalInstruccionesSubtema() {
    const modalHTML = `
        <div id="modalInstruccionesSubtema" class="modal fixed inset-0 bg-black/45 backdrop-blur-sm z-[10000] hidden items-center justify-center">
            <div class="bg-card text-foreground border border-border rounded-lg p-6 w-full max-w-3xl cb-modal-panel-scroll">
                <!-- Encabezado -->
                <div class="flex items-center justify-between mb-4">
                    <h3 id="tituloInstruccionesSubtema" class="text-lg font-semibold"></h3>
                    <button class="text-muted-foreground hover:text-foreground" data-mc-action="cerrar-modal-instrucciones-subtema">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Contenedor de instrucciones -->
                <div class="flex-1 overflow-y-auto mb-4">
                    <div id="instruccionesSubtema" 
                         class="p-4 border border-input rounded min-h-[300px] contenido-editable text-foreground" 
                         contenteditable="true"
                         data-placeholder="Escribe las instrucciones para este subtema aquí...">
                    </div>
                </div>
                
                <!-- Pie del modal -->
                <div class="flex justify-between items-center pt-4 border-t border-border">
                    <div class="text-xs text-muted-foreground">
                        <i class="fas fa-lightbulb mr-1"></i>
                        Usa este espacio para escribir instrucciones detalladas sobre el subtema
                    </div>
                    <div class="flex gap-2">
                        <button id="btnGuardarInstruccionesSubtema"
                                class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
                            <i class="fas fa-save mr-2"></i> Guardar Instrucciones
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}


// Después de las importaciones, agrega:
window.ejecutarGeneracionModuloGemini = async function (moduloId) {
    const cleanModuloId = String(moduloId || "").trim();
    if (!cleanModuloId) return;
    const contenedorModulo = document.getElementById(`contenido-${cleanModuloId}`);
    if (contenedorModulo) {
        contenedorModulo.dataset.lastSavedHtml = normalizarContenidoModuloPersistible(
            sanitizeRichText(contenedorModulo.innerHTML)
        );
    }
    if (moduloAutosaveTimers.has(cleanModuloId)) {
        clearTimeout(moduloAutosaveTimers.get(cleanModuloId));
        moduloAutosaveTimers.delete(cleanModuloId);
    }
    const triggerButtons = Array.from(document.querySelectorAll('[data-mc-action="ejecutar-generacion-modulo-gemini"]'))
        .filter((button) => String(button?.dataset?.mcModuloId || "").trim() === cleanModuloId);
    if (triggerButtons.some((button) => button.dataset.cbGenerating === "1")) {
        return;
    }
    triggerButtons.forEach((button) => {
        button.dataset.cbGenerating = "1";
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
    });
    try {
        await generarModuloGemini(cleanModuloId);
        window.__forceRefreshModuloId = cleanModuloId;
        const subtemaParaRefrescar = resolverSubtemaParaModulo(cleanModuloId);
        if (!subtemaParaRefrescar?.id) {
            throw new Error("El contenido se generó, pero no se pudo localizar el subtema activo para refrescar la vista.");
        }
        await cargarSubtema(subtemaParaRefrescar, cleanModuloId);
    } catch (err) {
        console.error("Error al generar contenido con IA:", err);
        alert(`Error al generar contenido con IA.\n${err?.message || "Revisa la consola o los logs del backend para más detalle."}`);
    } finally {
        triggerButtons.forEach((button) => {
            delete button.dataset.cbGenerating;
            button.disabled = false;
            button.setAttribute("aria-disabled", "false");
        });
    }
};

function moduloTieneActividadOriginalVisible(modulo = {}) {
    const contenidoActual = String(modulo?.contenido || "").trim();
    if (!contenidoActual) return false;
    return contenidoModuloYaIncluyeActividadOriginal(renderizarContenidoModulo(contenidoActual, modulo.tipo || ""));
}



// Modifica la llamada en renderModulosHTML para que pase correctamente los parámetros:
async function renderModulosHTML(subtema, moduloActivoId = null, modoLectura = false) {
    // Verificar si es curso duplicado
    const esCursoDuplicado = curso?.nombre?.includes("(Copia)") || false;
    const forceRefreshModuloId = String(window.__forceRefreshModuloId || "").trim();
    const forceRefreshModuloIdShort = forceRefreshModuloId ? forceRefreshModuloId.split('_').pop() : "";
    
    // Si es curso duplicado, forzar modo edición
    const esModoLecturaReal = modoLectura && !esCursoDuplicado;

    if (!subtema.modulosIds || subtema.modulosIds.length === 0) {
        return `<p class="text-gray-400 text-xs">No hay módulos.</p>`;
    }

    const modulosCargados = await Promise.all(
        subtema.modulosIds.map(async (modId) => {
            const modIdSafe = String(modId || "").trim();
            const modIdShort = modIdSafe ? modIdSafe.split('_').pop() : "";
            const shouldForceRefresh = !!forceRefreshModuloId && (
                modIdSafe === forceRefreshModuloId ||
                modIdSafe === forceRefreshModuloIdShort ||
                modIdShort === forceRefreshModuloIdShort
            );
            const mod = await obtenerModulo(modId, curso.id, { forceRefresh: shouldForceRefresh });
            return { modId, mod };
        })
    );

    // 🔥 VINCULACIÓN CRUCIAL: Mantener la lista de objetos de módulo en el subtema para sincronización
    subtema.modulos = modulosCargados.map(m => m.mod).filter(Boolean);
    if (window.subtemaActivo && window.subtemaActivo.id === subtema.id) {
        window.subtemaActivo.modulos = subtema.modulos;
    }

    let html = "";

    for (const { modId, mod } of modulosCargados) {
        if (!mod) continue;
        if (mod.archivado && !mostrarModulosArchivados) continue;

        const esActivo = modId === moduloActivoId || mod.id === moduloActivoId;
        let contenidoModuloHtml = renderizarContenidoModulo(mod.contenido, mod.tipo || "");
        if (mod.incluirImagenOriginalEnPropuesta && typeof window.insertarImagenOriginalEnPropuesta === "function") {
            contenidoModuloHtml = window.insertarImagenOriginalEnPropuesta(
                contenidoModuloHtml,
                mod.instrucciones || "",
                mod.tipo || ""
            );
        } else if (typeof window.asegurarTituloPropuestaEnHtml === "function") {
            contenidoModuloHtml = window.asegurarTituloPropuestaEnHtml(contenidoModuloHtml, mod.tipo || "");
        }
        const mostrarActividadOriginal = mod.mostrarActividadOriginal !== false;
        const bloqueActividadOriginal = construirActividadOriginalHtmlModulo(mod);
        const renderBloqueOriginal = bloqueActividadOriginal && !contenidoModuloYaIncluyeActividadOriginal(contenidoModuloHtml)
            ? bloqueActividadOriginal
            : "";

        html += `
<div class="p-4 border rounded-md bg-white shadow-sm hover:bg-gray-50 transition
    ${esActivo ? 'modulo-activo highlight-pulse' : ''}
    ${mostrarActividadOriginal ? '' : 'modulo-original-oculta'}" 
    id="modulo-${mod.id}"
    data-modulo-archivado="${mod.archivado ? "true" : "false"}">

    <div class="flex justify-between items-start">
    
        <!-- TÍTULO DEL MÓDULO -->
        <div>
            <p class="font-semibold ${esActivo ? 'text-blue-900' : 'text-gray-800'}">${mod.nombre}</p>
            <p class="text-xs text-gray-500">${mod.tipo}</p>
        </div>

        <!-- 🔥 CORRECCIÓN: Mostrar íconos solo si no es modo lectura REAL -->
        ${!esModoLecturaReal ? `
        <div class="flex items-center gap-3 text-sm">
            <label class="modulo-archive-switch" title="Archivar módulo" aria-label="Archivar módulo" data-tour="archivar">
                <input type="checkbox" class="cb-switch-archivar-modulo cb-switch-archivar-modulo-hidden"
                       ${mod.archivado ? "checked" : ""}
                       data-mc-action="toggle-archivo-modulo"
                       data-mc-modulo-id="${escapeHtml(mod.id)}">
                <span class="modulo-archive-switch__track" aria-hidden="true">
                    <span class="modulo-archive-switch__thumb"></span>
                </span>
                <span class="modulo-archive-switch__label">Archivar</span>
            </label>

            <!-- INSTRUCCIONES GEMINI -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Instrucciones IA"
                    aria-label="Instrucciones IA"
                    data-tour="instrucciones-ia"
                    data-mc-action="abrir-instrucciones-gemini"
                    data-mc-modulo-id="${escapeHtml(mod.id)}">
                <i class="fas fa-comment-dots text-purple-600"></i>
            </button>

            <!-- GENERAR IA -->
            <button type="button" class="icon-btn btn-modulo-accion"
                    title="Generar con IA"
                    aria-label="Generar con IA"
                    data-tour="generar-ia"
                    data-mc-action="ejecutar-generacion-modulo-gemini"
                    data-mc-modulo-id="${escapeHtml(mod.id)}">
                <i class="fas fa-magic text-blue-600"></i>
            </button>

            <button type="button" class="icon-btn btn-modulo-accion"
                    title="${mostrarActividadOriginal ? 'Ocultar actividad original' : 'Mostrar actividad original'}"
                    aria-label="${mostrarActividadOriginal ? 'Ocultar actividad original' : 'Mostrar actividad original'}"
                    data-mc-action="agregar-actividad-original-modulo"
                    data-mc-modulo-id="${escapeHtml(mod.id)}">
                <i class="fas ${mostrarActividadOriginal ? 'fa-eye' : 'fa-eye-slash'} text-emerald-600"></i>
            </button>

            <div class="cb-module-actions-menu">
                <button type="button"
                        class="icon-btn btn-modulo-accion cb-module-actions-menu__trigger"
                        title="Más acciones"
                        aria-label="Más acciones"
                        aria-haspopup="menu"
                        aria-expanded="false"
                        data-mc-action="toggle-menu-acciones-modulo"
                        data-mc-modulo-id="${escapeHtml(mod.id)}">
                    <i class="fas fa-ellipsis-v text-slate-600"></i>
                </button>
                <div class="cb-module-actions-menu__panel hidden" data-mc-menu-panel="${escapeHtml(mod.id)}">
                    <button type="button" data-mc-action="abrir-modal-notas-maestro" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-chalkboard-teacher text-green-600"></i><span>Notas del maestro</span></button>
                    <button type="button" data-mc-action="analizar-modulo" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-search text-orange-500"></i><span>Analizar módulo</span></button>
                    <button type="button" data-mc-action="abrir-modal-tono" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-adjust text-pink-600"></i><span>Cambiar tono</span></button>
                    <button type="button" data-mc-action="abrir-modal-crear-tabla" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-table text-indigo-500"></i><span>Crear tabla</span></button>
                    <button type="button" data-mc-action="traducir-modulo" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-language text-teal-600"></i><span>Traducir</span></button>
                    <button type="button" data-mc-action="eliminar-modulo" data-mc-modulo-id="${escapeHtml(mod.id)}"><i class="fas fa-trash text-red-600"></i><span>Eliminar</span></button>
                </div>
            </div>
        </div>
        ` : ''}
    </div>

    <!-- CONTENIDO DEL MÓDULO -->
    <div class="mt-3">
        <div id="spinner-${mod.id}" class="text-blue-600 text-xs mb-2 hidden"></div>
        ${renderBloqueOriginal}

        <!-- 🔥 CORRECCIÓN CRUCIAL: Usar esModoLecturaReal en lugar de modoLectura -->
        <div class="p-3 bg-gray-50 border border-gray-200 rounded modulo-contenido ${!esModoLecturaReal ? 'contenido-editable' : ''}" 
             id="contenido-${mod.id}"
             data-modulo-id="${mod.id}"
             contenteditable="${!esModoLecturaReal}">
            ${contenidoModuloHtml}
        </div>
    </div>

</div>
`;
    }

    if (!html.trim()) {
        return `<p class="text-gray-400 text-xs">No hay módulos.</p>`;
    }

    return html;
}

window.toggleArchivoModulo = async function(moduloId, archivado) {
    try {
        await guardarModulo(moduloId, { archivado: !!archivado });

        if (archivado) {
            const activo = localStorage.getItem("moduloActivo");
            if (activo === moduloId || (activo && moduloId.includes('_') && moduloId.split('_').pop() === activo)) {
                localStorage.removeItem("moduloActivo");
            }
        }

        if (subtemaActivo) {
            await cargarSubtema(subtemaActivo);
        }
        renderTemas();
    } catch (_) {
        alert("No se pudo actualizar el estado de archivo del módulo.");
    }
};

const TOUR_ACCIONES_MODULO_STEPS = [
    {
        key: "instrucciones-ia",
        titulo: "Añadir instrucción IA",
        texto: "En módulos tipo quiz u otros, puedes añadir las preguntas que quieras rehacer con el formato necesario para ser incluido en la plataforma Aprende."
    },
    {
        key: "generar-ia",
        titulo: "Generar con IA",
        texto: "Genera automáticamente contenido del módulo a partir de las instrucciones."
    },
    {
        key: "notas-maestro",
        titulo: "Notas del maestro",
        texto: "Si quieres crear notas del maestro de algún ejercicio o tema deseado, usa esta opción."
    },
    {
        key: "cambiar-tono",
        titulo: "Cambiar tono del contenido",
        texto: "Ajusta el tono de redacción: académico, científico u otros."
    },
    {
        key: "crear-tabla",
        titulo: "Crear tabla",
        texto: "Crea una tabla estructurada a partir del contenido actual del módulo."
    },
    {
        key: "traducir-modulo",
        titulo: "Traducir módulo",
        texto: "Traduce el módulo a diferentes idiomas."
    },
    {
        key: "analizar-modulo",
        titulo: "Analizar módulo",
        texto: "Revisa si el texto es coherente y detecta mejoras."
    },
    {
        key: "archivar",
        titulo: "Archivar",
        texto: "Archiva un módulo para ocultarlo; tampoco se incluirá en la descarga Word."
    },
    {
        key: "eliminar-modulo",
        titulo: "Eliminar módulo",
        texto: "Elimina el módulo cuando ya no lo necesites."
    }
];

function obtenerTourAccionesModuloOverlay() {
    let overlay = document.getElementById("cbTourAccionesModulo");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "cbTourAccionesModulo";
    overlay.className = "cb-tour-overlay hidden";
    overlay.innerHTML = `
        <div class="cb-tour-backdrop"></div>
        <div class="cb-tour-tooltip" role="dialog" aria-live="polite" aria-label="Guía de acciones del módulo">
            <div class="cb-tour-step"></div>
            <h4 class="cb-tour-title"></h4>
            <p class="cb-tour-body"></p>
            <div class="cb-tour-actions">
                <button type="button" class="cb-tour-btn cb-tour-btn-skip" id="cbTourSkip">Skip</button>
                <button type="button" class="cb-tour-btn cb-tour-btn-next" id="cbTourNext">Siguiente</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#cbTourSkip")?.addEventListener("click", () => {
        finalizarTourAccionesModulo("skip");
    });
    overlay.querySelector("#cbTourNext")?.addEventListener("click", () => {
        avanzarTourAccionesModulo();
    });

    return overlay;
}

function limpiarHighlightTourAccionesModulo() {
    if (tourAccionesModuloTarget) {
        tourAccionesModuloTarget.classList.remove("cb-tour-target-highlight");
    }
    tourAccionesModuloTarget = null;
}

function encontrarTargetTourAccionesModulo(stepKey) {
    return document.querySelector(`#listaModulos [data-tour="${stepKey}"]`);
}

function posicionarTooltipTourAccionesModulo(target) {
    const overlay = document.getElementById("cbTourAccionesModulo");
    if (!overlay) return;

    const tooltip = overlay.querySelector(".cb-tour-tooltip");
    if (!tooltip) return;

    const rect = target.getBoundingClientRect();
    const gap = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + gap;
    if (top + tooltipRect.height > viewportH - 8) {
        top = Math.max(8, rect.top - tooltipRect.height - gap);
    }

    let left = rect.left;
    if (left + tooltipRect.width > viewportW - 8) {
        left = viewportW - tooltipRect.width - 8;
    }
    left = Math.max(8, left);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
}

function renderPasoTourAccionesModulo() {
    if (!tourAccionesModuloActivo) return;

    const overlay = obtenerTourAccionesModuloOverlay();
    const step = TOUR_ACCIONES_MODULO_STEPS[tourAccionesModuloPaso];
    if (!step) {
        finalizarTourAccionesModulo("done");
        return;
    }

    const target = encontrarTargetTourAccionesModulo(step.key);
    if (!target) {
        avanzarTourAccionesModulo(true);
        return;
    }

    limpiarHighlightTourAccionesModulo();
    tourAccionesModuloTarget = target;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    target.classList.add("cb-tour-target-highlight");

    const total = TOUR_ACCIONES_MODULO_STEPS.length;
    const stepLabel = overlay.querySelector(".cb-tour-step");
    const stepTitle = overlay.querySelector(".cb-tour-title");
    const stepBody = overlay.querySelector(".cb-tour-body");
    const btnNext = overlay.querySelector("#cbTourNext");

    if (stepLabel) stepLabel.textContent = `Paso ${tourAccionesModuloPaso + 1} de ${total}`;
    if (stepTitle) stepTitle.textContent = step.titulo;
    if (stepBody) stepBody.textContent = step.texto;
    if (btnNext) btnNext.textContent = tourAccionesModuloPaso === total - 1 ? "Aceptar" : "Siguiente";

    overlay.classList.remove("hidden");
    requestAnimationFrame(() => posicionarTooltipTourAccionesModulo(target));
}

function avanzarTourAccionesModulo(saltandoTarget = false) {
    if (!tourAccionesModuloActivo) return;

    const total = TOUR_ACCIONES_MODULO_STEPS.length;
    if (!saltandoTarget) {
        tourAccionesModuloPaso += 1;
    } else {
        tourAccionesModuloPaso += 1;
    }

    if (tourAccionesModuloPaso >= total) {
        finalizarTourAccionesModulo("done");
        return;
    }
    renderPasoTourAccionesModulo();
}

function finalizarTourAccionesModulo(estadoFinal) {
    const overlay = document.getElementById("cbTourAccionesModulo");
    if (overlay) {
        overlay.classList.add("hidden");
    }
    limpiarHighlightTourAccionesModulo();
    tourAccionesModuloActivo = false;
    tourAccionesModuloPaso = 0;
    localStorage.setItem(TOUR_MODULOS_STORAGE_KEY, estadoFinal);
}

function iniciarTourBotonesModuloSiAplica() {
    const estado = localStorage.getItem(TOUR_MODULOS_STORAGE_KEY);
    if (estado === "done" || estado === "skip") return;
    if (tourAccionesModuloActivo) return;
    if (tourAccionesModuloMostradoEnSesion) return;

    const primerTarget = encontrarTargetTourAccionesModulo("instrucciones-ia");
    if (!primerTarget) return;

    tourAccionesModuloMostradoEnSesion = true;
    tourAccionesModuloActivo = true;
    tourAccionesModuloPaso = 0;
    renderPasoTourAccionesModulo();
}

window.addEventListener("resize", () => {
    if (tourAccionesModuloActivo && tourAccionesModuloTarget) {
        posicionarTooltipTourAccionesModulo(tourAccionesModuloTarget);
    }
});

document.addEventListener("scroll", () => {
    if (tourAccionesModuloActivo && tourAccionesModuloTarget) {
        posicionarTooltipTourAccionesModulo(tourAccionesModuloTarget);
    }
}, true);


// Variable global para almacenar el ID del módulo actual para notas del maestro
let moduloNotasMaestroId = null;

const ORDINALES = [
  "primera", "segunda", "tercera", "cuarta", "quinta", "sexta",
  "séptima", "septima",
  "octava", "novena", "décima", "decima",
  "undécima", "onceava",
  "duodécima", "doceava",
  "decimotercera", "decimocuarta", "decimoquinta"
];

const REGEX_ORDINALES = new RegExp(`\\b(${ORDINALES.join("|")})\\b`, "i");


function normalizarTipoModulo(tipo) {
  if (!tipo) return "contenido";

  const t = tipo.toLowerCase();

  if (t.includes("quiz")) return "quiz";
  if (t.includes("notas del maestro")) return "notas_maestro";
  if (t.includes("lección") || t.includes("leccion")) return "leccion";
  if (t.includes("página") || t.includes("pagina")) return "pagina";
  if (t.includes("temario")) return "temario";
  if (t.includes("lectura")) return "lectura";
  if (t.includes("libro")) return "libro";

  return "contenido";
}

const PERFILES_IDIOMA_NOTAS = [
  {
    code: "es",
    label: "español",
    words: [" el ", " la ", " los ", " las ", " para ", " con ", " que ", " una ", " del ", " actividad ", " estudiantes ", " aprendizaje ", " objetivo "]
  },
  {
    code: "en",
    label: "english",
    words: [" the ", " and ", " for ", " with ", " this ", " should ", " students ", " learning ", " objective ", " activity ", " lesson ", " write ", " explain "]
  },
  {
    code: "pt",
    label: "português",
    words: [" de ", " para ", " com ", " os ", " as ", " alunos ", " aprendizagem ", " objetivo ", " atividade ", " aula ", " texto "]
  },
  {
    code: "fr",
    label: "français",
    words: [" le ", " la ", " les ", " des ", " pour ", " avec ", " et ", " eleves ", " apprentissage ", " objectif ", " activite ", " cours "]
  }
];

function normalizarTextoIdiomaNotas(texto = "") {
  return ` ${String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function detectarIdiomaParaNotas(texto = "") {
  const normalizado = normalizarTextoIdiomaNotas(texto);
  if (!normalizado.trim()) {
    return { code: "es", label: "español", confidence: 0 };
  }

  const scores = PERFILES_IDIOMA_NOTAS.map((perfil) => {
    let score = 0;
    for (const token of perfil.words) {
      if (normalizado.includes(token)) score += 1;
    }
    return { ...perfil, score };
  }).sort((a, b) => b.score - a.score);

  const mejor = scores[0];
  const segundo = scores[1] || { score: 0 };

  if (!mejor || mejor.score === 0 || (mejor.score - segundo.score) < 1) {
    return { code: "es", label: "español", confidence: 0.25 };
  }

  return {
    code: mejor.code,
    label: mejor.label,
    confidence: Number((mejor.score / Math.max(1, mejor.score + segundo.score)).toFixed(2))
  };
}

function aplicarReglaIdiomaEnPromptNotas(promptBase, idiomaDetectado) {
  return `
IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado del módulo: ${idiomaDetectado.label} (${idiomaDetectado.code}).
- Escribe TODA la respuesta final en ${idiomaDetectado.label}.
- No traduzcas al español si el idioma detectado no es español.
- Mantén terminología pedagógica natural del idioma detectado.

${promptBase}
`;
}

function obtenerPlantillaEstructuraNotasMaestro(idiomaDetectado = { code: "es", label: "español" }) {
  const isEnglish = String(idiomaDetectado?.code || "").toLowerCase() === "en";

  if (isEnglish) {
    return {
      sectionNames: {
        opening: "Opening",
        whileUsingBook: "While Using the book section",
        closing: "Closing"
      },
      supportLabel: "Support activity",
      extensionLabel: "Extension activity",
      contract: `
MANDATORY OUTPUT STRUCTURE:
- Use ONLY these exact section titles and in this exact order:
  1. Opening
  2. While Using the book section
  3. Closing

TEMPLATE (keep the wording; only customize the word list and minor details to match the module text):

## Opening
Choose some words from the text, such as: <word1>, <word2>, <word3>, <word4>, <word5>, etc. Use Fit for Teaching Vocabulary in your app to follow the processes and vary the techniques. Keep the words in sight for students to use in the following activity.

## While Using the book section
Ask students to observe the picture and allow them to describe what they see with a partner. Give them a few minutes to write what they think the text will be about. Encourage them to use the words they learned. Monitor the activity and help if necessary. Use support and extension activities according to their needs.
Support activity: Provide a few examples for students to write their predictions, for example “I think the text is going to be about… I think the text will explain…”, etc.
Extension activity: Encourage students to use their previous knowledge to write their predictions.

## Closing
Ask students to compare what they wrote with a partner while you monitor and correct or validate their work. You can ask them to read to each other or swap books to read what their partners wrote.

HARD RULES:
- Do not add extra headings or sections.
- Keep "Support activity:" and "Extension activity:" exactly as written (including the colon).
- Return only the final teacher's notes content in markdown.
`
    };
  }

  return {
    sectionNames: {
      previousKnowledge: "Conocimientos previos",
      objectives: "Objetivos",
      opening: "Apertura",
      whileUsingBook: "Durante el uso del libro",
      closing: "Cierre"
    },
    abilitiesLabel: "Habilidades intelectuales",
    supportLabel: "Actividad de apoyo",
    extensionLabel: "Actividad de ampliación",
    objectiveLead: "Para",
    contract: `
ESTRUCTURA OBLIGATORIA DE SALIDA:
- Usa estos títulos exactos y en este orden:
  1. Conocimientos previos
  2. Objetivos
  3. Apertura
  4. Durante el uso del libro
  5. Cierre
- Dentro de "Objetivos", incluye:
  - una oración de objetivo que empiece con "Para"
  - una línea que empiece exactamente con "Habilidades intelectuales:"
- Dentro de "Durante el uso del libro", incluye:
  - la orientación principal para trabajar el contenido del libro o módulo
  - un párrafo que empiece exactamente con "Actividad de apoyo:"
  - un párrafo que empiece exactamente con "Actividad de ampliación:"
- No omitas ninguna sección, aunque debas adaptarla brevemente.
- Devuelve la respuesta en markdown usando encabezados con este formato:
  ## Conocimientos previos
  ## Objetivos
  ## Apertura
  ## Durante el uso del libro
  ## Cierre
`
  };
}

// Función para abrir el modal de Notas para el Maestro
window.abrirModalNotasMaestro = async function(moduloId) {
    moduloNotasMaestroId = moduloId;
    
    const modal = document.getElementById("modalNotasMaestro");
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Ocultar botón de regenerar inicialmente
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.add("hidden");
    }
    
    // Resetear botón de guardar
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
    
    // Mostrar loading
    contenidoModal.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-blue-500 text-2xl mb-2"></i>
                <p class="text-gray-600 text-sm">Cargando notas del maestro...</p>
            </div>
        </div>
    `;
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Verificar si ya hay notas guardadas
    const modulo = await obtenerModulo(moduloId);
    
    if (modulo && modulo.notasMaestro) {
        // Mostrar notas guardadas
        mostrarNotasGuardadas(modulo);
    } else {
        // Generar nuevas notas
        await generarNotasMaestroConIA(moduloId, modulo?.contenido || "");
    }
};

// Función para mostrar notas guardadas
function mostrarNotasGuardadas(modulo) {
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    if (!contenidoModal) return;
    
    // Mostrar las notas guardadas
    contenidoModal.innerHTML = sanitizarHtmlEditorial(modulo.notasMaestro);
    
    // Mostrar fecha de generación si existe
    if (modulo.notasMaestroGenerado) {
        const fecha = new Date(modulo.notasMaestroGenerado).toLocaleString();
        const fechaDiv = document.createElement('div');
        fechaDiv.className = "text-xs text-gray-500 mt-4 text-center";
        const icono = document.createElement("i");
        icono.className = "fas fa-clock mr-1";
        fechaDiv.appendChild(icono);
        fechaDiv.appendChild(document.createTextNode(` Generado: ${fecha}`));
        contenidoModal.appendChild(fechaDiv);
    }
    
    // Habilitar botón de guardar (para actualizar)
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Actualizar Notas';
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = false;
    }
    
    // Mostrar botón de regenerar
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.remove("hidden");
    }
    
    // Aplicar estilos
    aplicarEstilosNotas();
}

// Función para regenerar las notas
window.regenerarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) return;
    
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Deshabilitar botones temporalmente
    if (btnRegenerarNotas) btnRegenerarNotas.disabled = true;
    if (btnGuardarNotas) btnGuardarNotas.disabled = true;
    if (btnAplicarNotas) btnAplicarNotas.disabled = true;
    
    // Mostrar loading
    contenidoModal.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="text-center">
                <i class="fas fa-sync-alt fa-spin text-blue-500 text-2xl mb-2"></i>
                <p class="text-gray-600 text-sm">Regenerando notas del maestro...</p>
            </div>
        </div>
    `;
    
    // Obtener contenido actual del módulo
    const contElement = document.getElementById(`contenido-${moduloNotasMaestroId}`);
    let contenidoModulo = "";
    
    if (contElement) {
        contenidoModulo = contElement.innerHTML;
    } else {
        const modulo = await obtenerModulo(moduloNotasMaestroId);
        contenidoModulo = modulo?.contenido || "";
    }
    
    // Generar nuevas notas
    await generarNotasMaestroConIA(moduloNotasMaestroId, contenidoModulo);
    
    // Re-habilitar botones
    if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
};

// Función para generar notas académicas para el maestro (VERSIÓN SIMPLIFICADA)
async function generarNotasMaestroConIA(moduloId, contenidoModulo) {
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    try {
        // Obtener información del módulo
        const modulo = await obtenerModulo(moduloId);
        if (!modulo) {
            throw new Error("No se encontró el módulo");
        }
        
        // Obtener el contenido del módulo
        let contenidoHTML = "";
        const contElement = document.getElementById(`contenido-${moduloId}`);
        
        if (contElement) {
            contenidoHTML = contElement.innerHTML;
        } else {
            contenidoHTML = modulo.contenido || contenidoModulo || "";
        }
        
        // Limpiar y extraer el texto para análisis
        const contenidoLimpio = extraerTextoParaAnalisis(contenidoHTML);
        const idiomaDetectado = detectarIdiomaParaNotas(
            `${modulo?.nombre || ""}\n${modulo?.instrucciones || ""}\n${contenidoLimpio || ""}`
        );
        
        // Determinar el tipo de contenido
        const tipoModulo = modulo.tipo || "actividad";

        const { modo, preguntasDetectadas } = detectarModoNotasMaestro({
            tipoModulo,
            contenidoHTML,
            contenidoLimpio
        });

                
        // Construir prompt simple y directo
        const endpoint = getGeminiEndpoint();
        const totalPreguntas =
            (contenidoLimpio.match(/\?/g) || []).length;
        // Detectar número REAL de preguntas del quizz
        

        // Construcción del prompt CORREGIDO
        let prompt = "";

        if (modo === "quiz") {
        prompt = construirPromptQuizz({
            preguntasDetectadas,
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio,
            idiomaDetectado
        });
        } 
        else if (modo === "leccion") {
        prompt = construirPromptLeccion({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio,
            preguntasDetectadas,
            idiomaDetectado
        });
        } 
        else if (modo === "actividad_guiada") {
        prompt = construirPromptActividadGuiada({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio,
            idiomaDetectado
        });
        }
        else {
        prompt = construirPromptContenido({
            tipoModulo,
            nombreModulo: modulo.nombre || "Sin nombre",
            contenidoLimpio,
            idiomaDetectado
        });
        }

        prompt = aplicarReglaIdiomaEnPromptNotas(prompt, idiomaDetectado);

        const { response, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });

        if (!response.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${response.status}`));
        }

        const notasTexto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudieron generar las notas.";
        const contenidoNotasHTML = renderizarContenidoNotasMaestro(notasTexto);

        // Crear HTML con formato adecuado
        const notasHTML = `
        <div class="notas-maestro-simple space-y-4 text-sm text-slate-700 leading-relaxed">

            <!-- Header -->
            <div class="rounded-lg border bg-background p-4 shadow-sm">
            <div class="flex items-center gap-2 text-base font-semibold text-slate-900">
                <i class="fas fa-book-open text-slate-600"></i>
                Notas pedagógicas para el docente
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
                Orientaciones didácticas generadas a partir del contenido del módulo
            </p>
            </div>

            <!-- Metadata -->
            <div class="rounded-lg border bg-muted/40 p-4">
            <p class="text-xs text-slate-600">
                <span class="font-medium text-slate-900">Módulo analizado:</span>
                ${modulo.nombre || "Sin nombre"}
                <span class="mx-1 text-slate-400">•</span>
                <span class="capitalize">${tipoModulo}</span>
            </p>
            </div>

            <!-- Contenido -->
            <div class="space-y-4 rounded-lg border bg-background p-4">
            ${contenidoNotasHTML}
            </div>

        </div>
        `;

        // Mostrar en el modal
        contenidoModal.innerHTML = notasHTML;
        
        // Habilitar botón de guardar
        if (btnGuardarNotas) {
            btnGuardarNotas.disabled = false;
            btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
        }
        if (btnAplicarNotas) {
            btnAplicarNotas.disabled = false;
        }
        
        // Mostrar botón de regenerar
        if (btnRegenerarNotas) {
            btnRegenerarNotas.classList.remove("hidden");
        }
        
        // Aplicar estilos
        aplicarEstilosNotas();
        
    } catch (error) {
        contenidoModal.innerHTML = `
            <div class="cb-notes-error p-4">
                <p class="font-semibold cb-notes-error-title">Error al generar las notas</p>
                <p class="text-sm mt-2 cb-notes-error-message">${escapeHtml(error.message)}</p>
                <button data-mc-action="reintentar-notas-maestro"
                        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cb-notes-error-button">
                    <i class="fas fa-sync-alt mr-2"></i> Reintentar
                </button>
            </div>
        `;
        if (btnAplicarNotas) {
            btnAplicarNotas.disabled = true;
        }
    }
}

function construirPromptQuizz({
  preguntasDetectadas,
  tipoModulo,
  nombreModulo,
  contenidoLimpio,
  idiomaDetectado
}) {
  const plantilla = obtenerPlantillaEstructuraNotasMaestro(idiomaDetectado);
  const isEnglish = String(idiomaDetectado?.code || "").toLowerCase() === "en";
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar notas del maestro con estructura editorial fija para el siguiente quiz.

${plantilla.contract}

REGLAS OBLIGATORIAS:
- El módulo contiene EXACTAMENTE ${preguntasDetectadas} preguntas.
- Analiza únicamente las preguntas reales del quiz.
- No agregues preguntas inexistentes.
- No inventes estaciones ni recursos que no aparezcan.
- Convierte el análisis del quiz a la plantilla editorial obligatoria.
${isEnglish ? `
- Keep the exact English template structure and wording required by the contract.
- Make the "Choose some words from the text, such as:" list reflect the quiz vocabulary (5+ key words from the quiz content).
- In "While Using the book section", adapt "picture" to whatever the quiz provides (text, images, prompts) without adding new headings.
` : `
- En "${plantilla.sectionNames.previousKnowledge}" indica qué saberes y vocabulario conviene activar.
- En "${plantilla.sectionNames.objectives}" redacta una meta clara que inicie con "${plantilla.objectiveLead}" y añade la línea "${plantilla.abilitiesLabel}:".
- En "${plantilla.sectionNames.opening}" explica cómo introducir el quiz antes de resolverlo.
- En "${plantilla.sectionNames.whileUsingBook}" explica cómo acompañar cada pregunta como evidencia de comprensión, sin enumerarlas como examen aislado.
- En "${plantilla.supportLabel}:" incluye apoyo concreto para estudiantes que necesiten andamiaje.
- En "${plantilla.extensionLabel}:" incluye una variante de profundización fiel al contenido.
- En "${plantilla.sectionNames.closing}" explica cómo cerrar y verificar comprensión.
`}

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO DEL QUIZZ:
================================
${contenidoLimpio}
================================

Devuelve SOLO las notas del maestro en la estructura solicitada.
`;
}

function construirPromptContenido({
  tipoModulo,
  nombreModulo,
  contenidoLimpio,
  idiomaDetectado
}) {
  const plantilla = obtenerPlantillaEstructuraNotasMaestro(idiomaDetectado);
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar notas del maestro sobre un módulo de contenido con estructura editorial fija.

${plantilla.contract}

OBJETIVO:
Orientar al docente sobre cómo trabajar este contenido en el aula.

REGLAS:
- No estructures el texto como cuestionario.
- No uses ordinales ni bloques libres sin encabezados.
- No inventes actividades que no aparezcan.
- Analiza el contenido como una secuencia didáctica.

ENFÓCATE EN:
- Propósito pedagógico del contenido.
- Conocimientos previos necesarios.
- Cómo abordar el contenido paso a paso.
- Qué ideas clave deben enfatizarse.
- Qué aprendizajes se esperan.
- Usa la plantilla fija y adapta cada sección al contenido real del módulo.
- En "${plantilla.supportLabel}:" incluye una ayuda concreta para estudiantes con dificultad.
- En "${plantilla.extensionLabel}:" incluye una ampliación auténtica, no genérica.

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO A ANALIZAR:
================================
${contenidoLimpio}
================================

Devuelve SOLO las notas del maestro en la estructura solicitada.
`;
}

function construirPromptLeccion({
  tipoModulo,
  nombreModulo,
  contenidoLimpio,
  preguntasDetectadas,
  idiomaDetectado
}) {
  const plantilla = obtenerPlantillaEstructuraNotasMaestro(idiomaDetectado);
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar notas del maestro sobre una lección interactiva de Moodle con estructura editorial fija.

${plantilla.contract}

OBJETIVO:
Orientar al docente sobre cómo conducir la lección paso a paso,
aprovechando las escenas, el contenido y las preguntas como verificación
del aprendizaje, no como un cuestionario independiente.

REGLAS IMPORTANTES:
- NO trates la lección como un quizz.
- NO uses la palabra “cuestionario”.
- Las preguntas funcionan como puntos de control o verificación.
- No enumeres preguntas como si fueran un examen.
- NO inventes escenas, actividades ni rutas que no existan.
- Usa la plantilla fija y adapta cada sección al flujo de la lección.
- En "${plantilla.sectionNames.whileUsingBook}" explica cómo conducir la navegación y monitorear los puntos de verificación.
- Incluye "${plantilla.supportLabel}:" y "${plantilla.extensionLabel}:" dentro de esa sección.

ENFÓCATE EN:
- Propósito pedagógico general de la lección.
- Importancia de la secuencia de escenas.
- Qué conocimientos previos deben activarse.
- Cómo guiar al alumno durante el procedimiento o narrativa.
- Cómo usar las preguntas para reforzar comprensión y seguridad.
- Qué aprendizajes se esperan al finalizar la lección.

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}
- Cantidad de puntos de verificación: ${preguntasDetectadas}

CONTENIDO DE LA LECCIÓN:
================================
${contenidoLimpio}
================================

Devuelve SOLO las notas del maestro en la estructura solicitada.
`;
}

function construirPromptActividadGuiada({
  tipoModulo,
  nombreModulo,
  contenidoLimpio,
  idiomaDetectado
}) {
  const plantilla = obtenerPlantillaEstructuraNotasMaestro(idiomaDetectado);
  return `
Eres un experto en pedagogía y diseño instruccional.

Vas a generar notas del maestro para una actividad práctica con estructura editorial fija.

${plantilla.contract}

OBJETIVO:
Entregar instrucciones claras y accionables para que el docente ejecute la actividad con su grupo.

REGLAS IMPORTANTES:
- Redacta la guía en orden secuencial (inicio, desarrollo y cierre).
- Incluye tiempos sugeridos y qué debe observar el docente en cada etapa.
- Explica cómo acompañar al estudiante si se bloquea o comete errores.
- Incluye una forma simple de evidenciar el aprendizaje al final.
- NO inventes recursos que no estén en el contenido.
- Usa la plantilla fija como salida final.
- En "${plantilla.sectionNames.opening}" enfoca la activación y preparación.
- En "${plantilla.sectionNames.whileUsingBook}" describe la ejecución acompañada de la actividad.
- Incluye "${plantilla.supportLabel}:" y "${plantilla.extensionLabel}:" dentro de esa sección.

ENFÓCATE EN:
- Propósito de la actividad.
- Preparación previa del docente.
- Paso a paso para implementar el ejercicio.
- Preguntas de acompañamiento que puede usar el docente.
- Criterios de logro esperados.

INFORMACIÓN DEL MÓDULO:
- Tipo: ${tipoModulo}
- Nombre: ${nombreModulo}

CONTENIDO DE LA ACTIVIDAD:
================================
${contenidoLimpio}
================================

Devuelve SOLO las notas del maestro en la estructura solicitada.
`;
}



// Función para aplicar estilos a las notas
function aplicarEstilosNotas() {
    const contenedor = document.querySelector('.notas-maestro-simple');
    if (!contenedor) return;
    
    // Estilos para párrafos
    const parrafos = contenedor.querySelectorAll('p');
    parrafos.forEach((p, index) => {
        if (index > 0) { // No aplicar al primer párrafo si es el de información
            p.classList.add("cb-notes-paragraph");
            
            // Destacar párrafos con números de preguntas
            const texto = p.textContent.toLowerCase();
            const tieneNumero = REGEX_ORDINALES.test(texto);
            
            if (tieneNumero) {
                p.classList.add("cb-notes-paragraph-question");
            }
            
            // Resaltar números de preguntas
            p.innerHTML = p.innerHTML.replace(
                new RegExp(`\\b(${ORDINALES.join("|")})\\b (\\w+)`, "gi"), 
                '<strong class="cb-notes-ordinal-highlight">$1 $2</strong>'
            );
            
            // Resaltar frases clave
            const frasesClave = ['Le sugerimos que', 'Es importante que', 'Se recomienda'];
            frasesClave.forEach(frase => {
                if (p.textContent.toLowerCase().includes(frase.toLowerCase())) {
                    const regex = new RegExp(frase, 'gi');
                    p.innerHTML = p.innerHTML.replace(regex, `<span class="cb-notes-keyphrase-highlight">$&</span>`);
                }
            });
        }
    });
}

// Funciones auxiliares (mantener igual)
function extraerTextoParaAnalisis(html) {
    if (!html) return "";
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remover elementos de interfaz
    tempDiv.querySelectorAll('.parrafo-actions, .icon-btn, .fa, .btn').forEach(el => el.remove());
    
    // Obtener texto limpio
    const texto = tempDiv.textContent || tempDiv.innerText || "";
    
    // Limpiar espacios extras
    return texto.replace(/\s+/g, ' ').trim();
}

function limpiarYFormatearTexto(texto) {
    if (!texto) return "";
    
    // Limpiar código y marcas
    let textoLimpio = texto
        .replace(/```html/gi, "")
        .replace(/```/g, "")
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .trim();
    
    // Corregir mayúsculas al inicio de párrafos
    const parrafos = textoLimpio.split('\n\n');
    const parrafosCorregidos = parrafos.map(parrafo => {
        let p = parrafo.trim();
        if (p.length === 0) return "";
        
        // Asegurar que empiece con mayúscula
        p = p.charAt(0).toUpperCase() + p.slice(1);
        
        // Asegurar que termine con punto
        if (!p.endsWith('.') && !p.endsWith('!') && !p.endsWith('?')) {
            p += '.';
        }
        
        return p;
    }).filter(p => p.length > 0);
    
    return parrafosCorregidos.join('\n\n');
}

function normalizarTextoNotas(texto) {
    if (!texto) return "";

    let limpio = String(texto)
        .replace(/\r\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();

    // Quitar bloque markdown completo si viene envuelto en ```markdown ... ```
    if (/^```[\w-]*\s*\n[\s\S]*\n```$/m.test(limpio)) {
        limpio = limpio
            .replace(/^```[\w-]*\s*\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
    }

    return limpio;
}

function limpiarBloquesMarkdownEnvolventes(texto) {
    if (!texto) return "";
    let limpio = String(texto).trim();

    if (/^```[\w-]*\s*\n[\s\S]*\n```$/m.test(limpio)) {
        limpio = limpio
            .replace(/^```[\w-]*\s*\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
    }

    return limpio;
}

function decodificarSecuenciasEscapadas(texto) {
    if (!texto) return "";
    let salida = String(texto);

    // Secuencias JSON comunes que llegan como texto literal
    salida = salida
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        // No romper comandos TeX como \neq, \right, \text, etc.
        .replace(/\\n(?![A-Za-z])/g, '\n')
        .replace(/\\r(?![A-Za-z])/g, '\r')
        .replace(/\\t(?![A-Za-z])/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

    // Decodificar entidades HTML (ej: &lt;h2&gt;)
    const decoder = document.createElement('textarea');
    decoder.innerHTML = salida;
    return decoder.value;
}

function contieneHtmlRenderizable(texto) {
    if (!texto) return false;
    return /<\/?[a-z][\s\S]*>/i.test(texto);
}

function contieneSintaxisStemRenderizable(texto = "") {
    const value = String(texto || "");
    if (!value) return false;
    return /(\${1,2}[\s\S]+?\${1,2}|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\ce\{[\s\S]+?\}|\\pu\{[\s\S]+?\}|\\frac\{[\s\S]+?\}\{[\s\S]+?\}|\\[a-zA-Z]+(?:\{|\s))/m.test(value);
}

function renderizarStemEnElemento(root) {
    if (!root || typeof window === "undefined") return;
    if (!contieneSintaxisStemRenderizable(root.textContent || root.innerHTML || "")) return;
    const renderMath = window.renderMathInElement;
    if (typeof renderMath !== "function") return;

    try {
        renderMath(root, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "\\[", right: "\\]", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false }
            ],
            throwOnError: false,
            strict: "ignore",
            trust: true,
            ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"]
        });
    } catch (_) {
        // noop
    }
}

function renderizarContenidoModulo(contenido, tipoModulo = "") {
    const contenidoNormalizado = decodificarSecuenciasEscapadas(
        limpiarBloquesMarkdownEnvolventes(contenido || "")
    );
    if (!contenidoNormalizado) {
        return "<p class='text-xs text-gray-400'>Sin contenido generado.</p>";
    }

    if (contieneHtmlRenderizable(contenidoNormalizado)) {
        return decorarContenidoModuloRenderizado(sanitizarHtmlEditorial(contenidoNormalizado), tipoModulo);
    }

    if (contieneMarkdownEstructurado(contenidoNormalizado)) {
        return decorarContenidoModuloRenderizado(sanitizarHtmlEditorial(convertirMarkdownBasicoAHtml(contenidoNormalizado)), tipoModulo);
    }

    const parrafos = normalizarTextoNotas(contenidoNormalizado)
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${formatearInlineMarkdown(p).replace(/\n/g, '<br>')}</p>`);

    return decorarContenidoModuloRenderizado(sanitizarHtmlEditorial(parrafos.join('')), tipoModulo) || "<p class='text-xs text-gray-400'>Sin contenido generado.</p>";
}

window.renderizarContenidoModulo = renderizarContenidoModulo;

function normalizarContenidoModuloPersistible(contenido = "") {
    const raw = String(contenido || "").trim();
    if (!raw) return "";
    return sanitizarHtmlEditorial(renderizarContenidoModulo(raw));
}

window.normalizarContenidoModuloPersistible = normalizarContenidoModuloPersistible;

function decorarContenidoModuloRenderizado(html = "", tipoModulo = "") {
    const raw = String(html || "").trim();
    if (!raw || typeof document === "undefined") return raw;

    const root = document.createElement("div");
    root.innerHTML = raw;
    expandirBloquesEstructuradosModulo(root);
    renderizarStemEnElemento(root);

    const tipoNormalizado = normalizarTipoModulo(tipoModulo);
    const yaTieneTituloPropuesta = root.querySelector(".cb-module-block-title.is-proposal");
    const pareceContenidoDeActividad =
        root.querySelector(".cb-module-question-heading, .cb-module-feedback-line, .cb-module-generated-graphic") ||
        /^(pregunta\s+\d+|pregunta:|opciones:|respuesta correcta:|retroalimentaci[oó]n correcta:|retroalimentaci[oó]n incorrecta:|actividad\s+\d+)/im.test(String(root.textContent || "").trim());
    if (!yaTieneTituloPropuesta && tipoNormalizado !== "temario" && tipoNormalizado !== "lectura" && pareceContenidoDeActividad) {
        root.insertAdjacentHTML(
            "afterbegin",
            '<h3 class="cb-module-block-title is-proposal">Propuesta de actividad</h3>'
        );
    }

    if (normalizarTipoModulo(tipoModulo) === "temario") {
        decorarTablaTemario(root);
    }

    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach((node) => {
        const text = String(node.textContent || "").trim();
        if (!text) return;
        const normalized = text.toLowerCase();

        if (/^actividad\s+\d+\s+original\b/i.test(text) || normalized === "actividad original") {
            node.classList.add("cb-module-block-title", "is-original");
            return;
        }
        if (/^propuesta\s+actividad\s+\d+\b/i.test(text) || /^propuesta\b/i.test(text)) {
            node.classList.add("cb-module-block-title", "is-proposal");
            return;
        }
        if (/^t[ií]tulo:\s*/i.test(text)) {
            node.classList.add("cb-module-meta-line", "is-title");
            return;
        }
        if (/^pregunta\s+\d+\b/i.test(text)) {
            node.classList.add("cb-module-question-heading");
            return;
        }
        if (/^pregunta:\s*/i.test(text)) {
            node.classList.add("cb-module-meta-line", "is-question");
            return;
        }
        if (/^opciones:\s*/i.test(text)) {
            node.classList.add("cb-module-meta-line", "is-options");
            return;
        }
        if (/^respuesta correcta:\s*/i.test(text)) {
            node.classList.add("cb-module-feedback-line", "is-answer");
            return;
        }
        if (/^retroalimentaci[oó]n correcta:\s*/i.test(text)) {
            node.classList.add("cb-module-feedback-line", "is-correct");
            return;
        }
        if (/^retroalimentaci[oó]n incorrecta:\s*/i.test(text)) {
            node.classList.add("cb-module-feedback-line", "is-incorrect");
            return;
        }
        if (/^retroalimentaci[oó]n global:\s*/i.test(text)) {
            node.classList.add("cb-module-feedback-line", "is-global");
        }
    });

    const headings = Array.from(root.querySelectorAll(".cb-module-block-title.is-original, .cb-module-block-title.is-proposal"));
    headings.forEach((heading) => {
        const nextBlock = heading.nextElementSibling;
        if (!nextBlock) return;

        if (heading.classList.contains("is-original")) {
            nextBlock.classList.add("cb-module-original-body");
            return;
        }

        if (heading.classList.contains("is-proposal")) {
            const maybeQuestionHeading = nextBlock;
            if (maybeQuestionHeading.classList.contains("cb-module-question-heading")) {
                const questionText = String(maybeQuestionHeading.textContent || "").trim();
                const match = questionText.match(/^pregunta\s+\d+\s+[—-]\s+(.+)$/i);
                const suffix = match ? match[1].trim() : questionText.replace(/^pregunta\s+\d+\s*[—-]?\s*/i, "").trim();
                if (suffix) {
                    const headingText = String(heading.textContent || "").trim();
                    const headingTail = headingText.split(/[—-]/).pop()?.trim().toLowerCase() || "";
                    const suffixNormalized = suffix.toLowerCase();
                    if (headingTail !== suffixNormalized) {
                        heading.textContent = `${headingText} — ${suffix}`;
                    } else {
                        heading.textContent = headingText;
                    }
                }
                maybeQuestionHeading.remove();
            }
        }
    });

    root.querySelectorAll(".cb-module-section-separator").forEach((node) => node.remove());
    root.querySelectorAll(".cb-module-feedback-line.is-global").forEach((node) => {
        const next = node.nextElementSibling;
        if (!next) return;
        if (next.classList.contains("cb-module-section-separator")) return;
        const separator = document.createElement("p");
        separator.className = "cb-module-section-separator";
        separator.setAttribute("aria-hidden", "true");
        separator.innerHTML = "&nbsp;";
        node.insertAdjacentElement("afterend", separator);
    });

    root.querySelectorAll("ul, ol").forEach((listEl) => {
        const items = Array.from(listEl.querySelectorAll(":scope > li"));
        if (!items.length) return;
        const allAlphaOptions = items.every((item) => /^[A-Z]\)\s+/.test(String(item.textContent || "").trim()));
        if (allAlphaOptions) {
            listEl.classList.add("cb-module-alpha-options");
            const isCompactOptionSet = items.length >= 4 && items.every((item) => {
                const text = String(item.textContent || "").replace(/\s+/g, " ").trim();
                return text.length <= 36;
            });
            if (isCompactOptionSet) {
                listEl.classList.add("cb-module-alpha-options--compact");
            }
        }
    });

    const blockChildren = Array.from(root.children);
    let currentQuestionBlock = null;

    blockChildren.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        const startsNewQuestion =
            node.classList.contains("cb-module-question-heading") ||
            node.classList.contains("cb-module-block-title") ||
            node.classList.contains("cb-module-original-body");

        if (node.classList.contains("cb-module-question-heading")) {
            currentQuestionBlock = document.createElement("section");
            currentQuestionBlock.className = "cb-module-question-block";
            node.parentNode?.insertBefore(currentQuestionBlock, node);
            currentQuestionBlock.appendChild(node);
            return;
        }

        if (startsNewQuestion) {
            currentQuestionBlock = null;
            return;
        }

        if (currentQuestionBlock) {
            currentQuestionBlock.appendChild(node);
        }
    });

    root.querySelectorAll(".cb-module-generated-graphic").forEach((figure) => {
        renderModuleGraphicInlinePreview(figure);
    });

    return root.innerHTML;
}

function decorarTablaTemario(root) {
    if (!root) return;
    const table = root.querySelector("table");
    if (!table) return;

    table.classList.add("cb-temario-table");

    const headers = Array.from(table.querySelectorAll("thead th"));
    if (headers.length >= 3) {
        const first = String(headers[0].textContent || "").trim().toLowerCase();
        const second = String(headers[1].textContent || "").trim().toLowerCase();
        const third = String(headers[2].textContent || "").trim().toLowerCase();

        if (first === "cli") {
            headers[0].textContent = "CLIL";
        }
        if (second === "language arts") {
            headers[1].textContent = "Language Arts (Grammar & Vocabulary)";
        }
        if (third === "language functions") {
            headers[2].textContent = "Language Functions (Skills)";
        }
        if (second === "lengua" || second === "lengua / language arts") {
            headers[1].textContent = "Lengua y vocabulario";
        }
        if (third === "funciones del lenguaje") {
            headers[2].textContent = "Funciones del lenguaje y habilidades";
        }
    }

    const heading = root.querySelector("h1, h2, h3");
    if (heading) {
        heading.classList.add("cb-temario-heading");
    }

    const firstBodyCell = table.querySelector("tbody td");
    if (firstBodyCell) {
        firstBodyCell.classList.add("cb-temario-cell-topic");
    }
}

function expandirBloquesEstructuradosModulo(root) {
    if (!root) return;

    const candidates = Array.from(root.querySelectorAll("p"));
    candidates.forEach((node) => {
        const html = String(node.innerHTML || "").trim();
        if (!html || !/<br\s*\/?>/i.test(html)) return;

        const normalizedHtml = html
            .replace(/\r\n/g, "\n")
            .replace(/<br\s*\/?>/gi, "\n");

        const lines = normalizedHtml
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length < 2) return;

        const looksStructured = lines.some((line) =>
            /^(pregunta:|opciones:|respuesta correcta:|retroalimentaci[oó]n correcta:|retroalimentaci[oó]n incorrecta:|retroalimentaci[oó]n global:|[A-Z]\)\s+|verdadero$|falso$)/i.test(
                stripHtmlTags(line)
            )
        );
        if (!looksStructured) return;

        const fragment = document.createDocumentFragment();
        let optionItems = [];

        const flushOptions = () => {
            if (!optionItems.length) return;
            const ul = document.createElement("ul");
            ul.className = "cb-module-alpha-options";
            optionItems.forEach((itemHtml) => {
                const li = document.createElement("li");
                li.innerHTML = itemHtml;
                ul.appendChild(li);
            });
            fragment.appendChild(ul);
            optionItems = [];
        };

        lines.forEach((lineHtml) => {
            const lineText = stripHtmlTags(lineHtml);
            if (/^[A-Z]\)\s+/i.test(lineText) || /^(verdadero|falso)$/i.test(lineText)) {
                optionItems.push(lineHtml);
                return;
            }

            flushOptions();
            const p = document.createElement("p");
            p.innerHTML = lineHtml;
            fragment.appendChild(p);
        });

        flushOptions();

        if (!fragment.childNodes.length) return;
        node.replaceWith(fragment);
    });
}

function stripHtmlTags(value = "") {
    const temp = document.createElement("div");
    temp.innerHTML = String(value || "");
    return String(temp.textContent || "").trim();
}

function contieneMarkdownEstructurado(texto) {
    if (!texto) return false;

    return /(^|\n)\s{0,3}#{1,6}\s+/.test(texto) ||
        /(^|\n)\s{0,3}[-*+]\s+/.test(texto) ||
        /(^|\n)\s{0,3}\d+\.\s+/.test(texto) ||
        /(^|\n)\s*\|.+\|\s*(\n|$)/.test(texto) ||
        /(^|\n)\s*>\s+/.test(texto) ||
        /\*\*[^*]+\*\*/.test(texto) ||
        /`[^`]+`/.test(texto);
}

function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearInlineMarkdown(texto) {
    let resultado = escaparHtml(texto);

    // Código inline
    resultado = resultado.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-slate-800">$1</code>');

    // Enlaces http/https
    resultado = resultado.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>');

    // Negrita / cursiva
    resultado = resultado.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    resultado = resultado.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    resultado = resultado.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    resultado = resultado.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    return resultado;
}

function convertirMarkdownBasicoAHtml(markdown) {
    const lineas = normalizarTextoNotas(markdown).split('\n');
    const html = [];

    let bufferParrafo = [];
    let enListaUl = false;
    let enListaOl = false;
    let enCita = false;
    let enBloqueCodigo = false;
    let bufferCodigo = [];
    let enTabla = false;

    const cerrarParrafo = () => {
        if (!bufferParrafo.length) return;
        const contenido = formatearInlineMarkdown(bufferParrafo.join('\n')).replace(/\n/g, '<br>');
        html.push(`<p class="cb-notes-paragraph">${contenido}</p>`);
        bufferParrafo = [];
    };

    const cerrarListas = () => {
        if (enListaUl) {
            html.push('</ul>');
            enListaUl = false;
        }
        if (enListaOl) {
            html.push('</ol>');
            enListaOl = false;
        }
    };

    const cerrarCita = () => {
        if (!enCita) return;
        html.push('</blockquote>');
        enCita = false;
    };

    const cerrarBloqueCodigo = () => {
        if (!enBloqueCodigo) return;
        html.push(`<pre class="bg-slate-100 rounded-md p-3 overflow-x-auto text-xs my-2"><code>${escaparHtml(bufferCodigo.join('\n'))}</code></pre>`);
        enBloqueCodigo = false;
        bufferCodigo = [];
    };

    const parsearCeldasTabla = (lineaTabla) =>
        lineaTabla
            .trim()
            .replace(/^\|?/, '')
            .replace(/\|?$/, '')
            .split('|')
            .map(celda => formatearInlineMarkdown(celda.trim()));

    const esLineaTabla = (lineaTabla) => /^\s*\|?.+\|.+\|?\s*$/.test(lineaTabla);
    const esSeparadorTabla = (lineaTabla) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lineaTabla);

    const cerrarTabla = () => {
        if (!enTabla) return;
        html.push('</tbody></table>');
        enTabla = false;
    };

    for (let i = 0; i < lineas.length; i++) {
        const lineaOriginal = lineas[i];
        const linea = lineaOriginal ?? '';
        const trim = linea.trim();

        if (enTabla && !esLineaTabla(linea)) {
            cerrarTabla();
        }

        if (/^```/.test(trim)) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            if (enBloqueCodigo) {
                cerrarBloqueCodigo();
            } else {
                enBloqueCodigo = true;
                bufferCodigo = [];
            }
            continue;
        }

        if (enBloqueCodigo) {
            bufferCodigo.push(linea);
            continue;
        }

        if (!trim) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            continue;
        }

        if (esLineaTabla(linea)) {
            const siguiente = lineas[i + 1] ?? '';
            const siguienteEsSeparador = esSeparadorTabla(siguiente);

            if (!enTabla && siguienteEsSeparador) {
                cerrarParrafo();
                cerrarListas();
                cerrarCita();

                const encabezados = parsearCeldasTabla(linea);
                html.push('<table class="w-full border-collapse text-sm my-3"><thead><tr>');
                encabezados.forEach((h) => {
                    html.push(`<th class="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">${h}</th>`);
                });
                html.push('</tr></thead><tbody>');
                enTabla = true;
                i += 1; // Saltar línea separadora |---|
                continue;
            }

            if (enTabla) {
                const celdas = parsearCeldasTabla(linea);
                html.push('<tr>');
                celdas.forEach((c) => {
                    html.push(`<td class="border border-slate-300 px-2 py-1 align-top">${c}</td>`);
                });
                html.push('</tr>');
                continue;
            }
        }

        const encabezado = linea.match(/^\s*(#{1,6})\s+(.+)$/);
        if (encabezado) {
            cerrarParrafo();
            cerrarListas();
            cerrarCita();
            cerrarTabla();
            const nivel = encabezado[1].length;
            const tituloRaw = encabezado[2].trim();
            const contenido = formatearInlineMarkdown(tituloRaw);
            
            let extraClass = "";
            let icon = "";
            
            const lower = tituloRaw.toLowerCase();
            if (lower.includes("conocimientos previos") || lower.includes("previous knowledge")) {
                extraClass = "cb-notes-section-preview";
                icon = '<i class="fas fa-brain mr-2"></i>';
            } else if (lower.includes("objetivos") || lower.includes("objectives")) {
                extraClass = "cb-notes-section-objectives";
                icon = '<i class="fas fa-bullseye mr-2"></i>';
            } else if (lower.includes("apertura") || lower.includes("opening")) {
                extraClass = "cb-notes-section-opening";
                icon = '<i class="fas fa-door-open mr-2"></i>';
            } else if (lower.includes("durante el ") || lower.includes("while using the")) {
                extraClass = "cb-notes-section-main";
                icon = '<i class="fas fa-chalkboard-teacher mr-2"></i>';
            } else if (lower.includes("actividad de ampliación") || lower.includes("extension activity")) {
                extraClass = "cb-notes-section-extension";
                icon = '<i class="fas fa-rocket mr-2"></i>';
            } else if (lower.includes("actividad de refuerzo") || lower.includes("support activity")) {
                extraClass = "cb-notes-section-support";
                icon = '<i class="fas fa-life-ring mr-2"></i>';
            } else if (lower.includes("cierre") || lower.includes("closing")) {
                extraClass = "cb-notes-section-closing";
                icon = '<i class="fas fa-flag-checkered mr-2"></i>';
            }
            
            html.push(`<h${nivel} class="cb-notes-header ${extraClass}">${icon}${contenido}</h${nivel}>`);
            continue;
        }

        const itemUl = linea.match(/^\s*[-*+]\s+(.+)$/);
        if (itemUl) {
            cerrarParrafo();
            cerrarCita();
            cerrarTabla();
            if (enListaOl) {
                html.push('</ol>');
                enListaOl = false;
            }
            if (!enListaUl) {
                html.push('<ul class="list-disc pl-6 my-2 space-y-1">');
                enListaUl = true;
            }
            html.push(`<li>${formatearInlineMarkdown(itemUl[1].trim())}</li>`);
            continue;
        }

        const itemOl = linea.match(/^\s*\d+\.\s+(.+)$/);
        if (itemOl) {
            cerrarParrafo();
            cerrarCita();
            cerrarTabla();
            if (enListaUl) {
                html.push('</ul>');
                enListaUl = false;
            }
            if (!enListaOl) {
                html.push('<ol class="list-decimal pl-6 my-2 space-y-1">');
                enListaOl = true;
            }
            html.push(`<li>${formatearInlineMarkdown(itemOl[1].trim())}</li>`);
            continue;
        }

        const cita = linea.match(/^\s*>\s?(.*)$/);
        if (cita) {
            cerrarParrafo();
            cerrarListas();
            cerrarTabla();
            if (!enCita) {
                html.push('<blockquote class="border-l-4 border-slate-300 pl-3 italic text-slate-700 my-2">');
                enCita = true;
            }
            const contenidoCita = cita[1].trim();
            if (contenidoCita) {
                html.push(`<p class="mb-2 last:mb-0">${formatearInlineMarkdown(contenidoCita)}</p>`);
            }
            continue;
        }

        cerrarListas();
        cerrarCita();
        bufferParrafo.push(linea);
    }

    cerrarParrafo();
    cerrarListas();
    cerrarCita();
    cerrarTabla();
    cerrarBloqueCodigo();

    return html.join('');
}

function renderizarContenidoNotasMaestro(notasTexto) {
    const textoNormalizado = normalizarTextoNotas(notasTexto);
    if (!textoNormalizado) return '<p class="cb-notes-paragraph">No se pudieron generar las notas.</p>';

    if (contieneMarkdownEstructurado(textoNormalizado)) {
        return convertirMarkdownBasicoAHtml(textoNormalizado);
    }

    return formatearParrafos(limpiarYFormatearTexto(textoNormalizado));
}

function detectarModoNotasMaestro({ tipoModulo, contenidoHTML, contenidoLimpio }) {
  const tipoNormalizado = normalizarTipoModulo(tipoModulo);

  const preguntasDetectadas =
    (contenidoHTML.match(/PREGUNTA\s*\d+/gi) || []).length;

  switch (tipoNormalizado) {
    case "quiz":
      return {
        modo: "quiz",
        preguntasDetectadas
      };

    case "leccion":
      return {
        modo: "leccion",
        preguntasDetectadas
      };

    case "notas_maestro":
      return {
        modo: "actividad_guiada",
        preguntasDetectadas: 0
      };

    case "pagina":
    case "libro":
      return {
        modo: "contenido",
        preguntasDetectadas: 0
      };

    default:
      return {
        modo: "contenido",
        preguntasDetectadas: 0
      };
  }
}


function formatearParrafos(texto) {
    const parrafos = texto.split('\n\n').filter(p => p.trim().length > 0);
    
    return parrafos.map((parrafo, index) => {
        const tieneNumero = REGEX_ORDINALES.test(parrafo.toLowerCase());
        
        let clases = "cb-notes-paragraph";
        
        if (index === 0) {
            clases += " cb-notes-paragraph-intro";
        } else if (tieneNumero) {
            clases += " cb-notes-paragraph-question";
        }
        
        // Resaltar números de preguntas
        let contenido = parrafo.replace(
            /\b(primera|segunda|tercera|cuarta|quinta|sexta)\b (\w+)/gi, 
            '<strong class="cb-notes-ordinal-highlight">$1 $2</strong>'
        );
        
        return `<p class="${clases}">${contenido}</p>`;
    }).join('');
}

// Función para guardar las notas generadas
window.guardarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) {
        alert("No hay módulo seleccionado");
        return;
    }
    
    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    
    if (!contenidoModal || contenidoModal.innerHTML.includes("Error")) {
        alert("No hay notas válidas para guardar");
        return;
    }
    
    try {
        // Cambiar estado de los botones
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = true;
        
        // Obtener el módulo
        const modulo = await obtenerModulo(moduloNotasMaestroId);
        
        // Guardar las notas en el módulo
        await guardarModulo(moduloNotasMaestroId, {
            notasMaestro: sanitizarHtmlEditorial(contenidoModal.innerHTML),
            notasMaestroGenerado: new Date().toISOString()
        });
        
        // Restaurar botones
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Actualizar Notas';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
        
        // Mostrar notificación
        mostrarNotificacion("✅ Notas para el maestro guardadas correctamente", 'success');
        
        // Actualizar la vista para mostrar que están guardadas
        const fecha = new Date().toLocaleString();
        const fechaDiv = document.createElement('div');
        fechaDiv.className = "text-xs text-green-600 mt-4 text-center";
        fechaDiv.innerHTML = `<i class="fas fa-check-circle mr-1"></i> Guardado: ${fecha}`;
        contenidoModal.appendChild(fechaDiv);
        
    } catch (error) {
        
        // Restaurar botones
        btnGuardarNotas.disabled = false;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
        if (btnRegenerarNotas) btnRegenerarNotas.disabled = false;
        
        mostrarNotificacion(`❌ Error al guardar: ${error.message}`, 'error');
    }
};

window.aplicarNotasMaestro = async function() {
    if (!moduloNotasMaestroId) {
        alert("No hay módulo seleccionado");
        return;
    }

    const contenidoModal = document.getElementById("contenidoNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    if (!contenidoModal || !btnAplicarNotas) return;

    if (contenidoModal.innerHTML.includes("Error")) {
        alert("No hay notas válidas para aplicar");
        return;
    }

    const bloqueNotas = contenidoModal.querySelector(".notas-maestro-simple");
    const htmlAplicable = sanitizarHtmlEditorial((bloqueNotas ? bloqueNotas.outerHTML : contenidoModal.innerHTML).trim());
    if (!htmlAplicable) {
        alert("No hay contenido generado para aplicar");
        return;
    }

    try {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Aplicando...';

        const contModulo = document.getElementById(`contenido-${moduloNotasMaestroId}`);
        if (contModulo) {
            contModulo.innerHTML = htmlAplicable;
        }

        await guardarModulo(moduloNotasMaestroId, { contenido: htmlAplicable });

        mostrarNotificacion("✅ Contenido aplicado al módulo correctamente", "success");
    } catch (error) {
        mostrarNotificacion(`❌ Error al aplicar contenido: ${error.message}`, "error");
    } finally {
        btnAplicarNotas.disabled = false;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
};

// Función para cerrar el modal
window.cerrarModalNotasMaestro = function() {
    const modal = document.getElementById("modalNotasMaestro");
    const btnGuardarNotas = document.getElementById("btnGuardarNotasMaestro");
    const btnRegenerarNotas = document.getElementById("btnRegenerarNotasMaestro");
    const btnAplicarNotas = document.getElementById("btnAplicarNotasMaestro");
    
    // Resetear estado
    moduloNotasMaestroId = null;
    
    // Limpiar contenido
    document.getElementById("contenidoNotasMaestro").innerHTML = "";
    
    // Resetear botones
    if (btnGuardarNotas) {
        btnGuardarNotas.disabled = true;
        btnGuardarNotas.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Notas';
    }
    
    if (btnRegenerarNotas) {
        btnRegenerarNotas.classList.add("hidden");
        btnRegenerarNotas.disabled = false;
    }
    if (btnAplicarNotas) {
        btnAplicarNotas.disabled = true;
        btnAplicarNotas.innerHTML = '<i class="fas fa-file-import mr-2"></i> Aplicar al módulo';
    }
    
    // Ocultar modal
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};


async function eliminarModulo(moduloId) {
    const sub = subtemaActivo;

    // Eliminar del array local (usando solo el ID interno si es necesario)
    const idInterno = extraerIdInternoModulo(moduloId);
    sub.modulosIds = sub.modulosIds.filter(id => {
        // Comparar IDs: si el ID en el array contiene guión bajo, comparar completo
        // si no, comparar solo la parte después del guión bajo
        if (id.includes('_')) {
            return id !== moduloId;
        } else {
            return id !== idInterno;
        }
    });
    
    await guardarCursoFirebase();

    // IMPORTANTE: Borrar con ID compuesto
    const idParaBorrar = moduloId.includes('_') ? moduloId : `${curso.id}_${moduloId}`;
    await deleteDoc(doc(db, "moodleCourses", idParaBorrar));

    cargarSubtema(sub);
}

window.eliminarModulo = eliminarModulo;





/* SELECTOR PARA AÑADIR NUEVO MÓDULO */
/* ======================================================
   MODAL SIMPLE: Seleccionar tipo de módulo
====================================================== */

function construirContenidoInicialModulo(tipo) {
    const tipoNormalizado = normalizarTipoModulo(tipo);
    if (tipoNormalizado === "temario") {
        return `
<h2>Temario</h2>
<p>Presenta aquí el recorrido general del subtema en formato de tabla, con columnas claras para tema, contenidos clave y funciones o desempeños.</p>
`.trim();
    }

    if (tipoNormalizado === "lectura") {
        return `
<h2>Lectura</h2>
<p>Pega en instrucciones el texto completo de la lectura para transcribirlo y estructurarlo sin modificar su contenido.</p>
`.trim();
    }

    if (tipoNormalizado !== "notas_maestro") return "";

    return `
<div class="notas-maestro-simple">
  <h2>Conocimientos previos</h2>
  <p>Active ideas previas del grupo sobre el tema, el vocabulario clave y el contexto necesario para comprender la actividad.</p>

  <h2>Objetivos</h2>
  <p>Para aplicar los conceptos centrales del módulo en una situación guiada, con acompañamiento docente y reflexión final.</p>
  <p><strong>Habilidades intelectuales:</strong> CFU, CFC, NST, NFU, NMI</p>

  <h2>Apertura</h2>
  <p>Presente brevemente el reto, modele un ejemplo corto y confirme que el grupo entiende la consigna antes de iniciar.</p>

  <h2>Durante el uso del libro</h2>
  <p>Indique al alumnado que resuelva la actividad paso a paso, individualmente o en parejas, mientras usted monitorea y da retroalimentación puntual.</p>
  <p><strong>Actividad de apoyo:</strong> Ofrezca vocabulario visible, pistas guiadas o un ejemplo parcial para estudiantes que necesiten andamiaje.</p>
  <p><strong>Actividad de ampliación:</strong> Pida una variante más compleja, una justificación adicional o una aplicación en un contexto nuevo.</p>

  <h2>Cierre</h2>
  <p>Socialice respuestas, compare estrategias y cierre con una breve reflexión sobre qué aprendieron y cómo lo resolvieron.</p>
</div>
`.trim();
}

function construirInstruccionesInicialesModulo(tipo) {
    const tipoNormalizado = normalizarTipoModulo(tipo);
    if (tipoNormalizado === "temario") {
        return "";
    }

    if (tipoNormalizado === "lectura") {
        return `
Transcribe exactamente la lectura que voy a pegar.
No cambies palabras, no resumas, no parafrasees y no agregues ejercicios.
Solo organiza el contenido con buena estructura: título, subtítulos, párrafos, listas o tablas si ya existen en el texto base.
`.trim();
    }

    if (tipoNormalizado !== "notas_maestro") return "";

    return `
Genera el contenido del módulo con esta estructura fija de Notas del maestro.

Títulos obligatorios y en este orden:
1. Conocimientos previos
2. Objetivos
3. Apertura
4. Durante el uso del libro
5. Cierre

Reglas obligatorias:
- En "Objetivos" incluye una oración que empiece con "Para".
- Después incluye una línea exacta que empiece con "Habilidades intelectuales:".
- Dentro de "Durante el uso del libro" incluye:
  - orientación principal para acompañar el trabajo
  - un párrafo que empiece exactamente con "Actividad de apoyo:"
  - un párrafo que empiece exactamente con "Actividad de ampliación:"
- Usa español natural, tono docente profesional y estructura editorial clara.
- Devuelve el resultado con encabezados visibles y contenido listo para mostrarse en el módulo.
`.trim();
}

function obtenerSubtemaActualDesdeCurso(subtemaId) {
    if (!curso?.temas || !subtemaId) return null;
    for (const tema of curso.temas) {
        const encontrado = tema?.subtemas?.find((sub) => sub?.id === subtemaId);
        if (encontrado) return encontrado;
    }
    return null;
}

function obtenerMetaSelectorModulo(tipo = "") {
    const tipoNormalizado = normalizarTipoModulo(tipo);
    const meta = {
        quizz: {
            icon: "fa-circle-question",
            accent: "blue",
            ayuda: "Preguntas, respuestas y retroalimentacion."
        },
        pagina: {
            icon: "fa-file-lines",
            accent: "slate",
            ayuda: "Contenido limpio para lectura o referencia."
        },
        temario: {
            icon: "fa-table-list",
            accent: "emerald",
            ayuda: "Estructura de ruta, tabla o secuencia."
        },
        lectura: {
            icon: "fa-book-open-reader",
            accent: "amber",
            ayuda: "Texto base para transcripcion o analisis."
        },
        archivo: {
            icon: "fa-file",
            accent: "gray",
            ayuda: "Archivo simple para adjuntar material."
        },
        libro: {
            icon: "fa-book",
            accent: "violet",
            ayuda: "Bloques largos con secciones."
        },
        leccion: {
            icon: "fa-chalkboard-user",
            accent: "rose",
            ayuda: "Secuencia guiada paso a paso."
        },
        tarea: {
            icon: "fa-clipboard-check",
            accent: "orange",
            ayuda: "Actividad evaluable con entrega."
        },
        url: {
            icon: "fa-link",
            accent: "cyan",
            ayuda: "Enlace externo o recurso web."
        },
        "archivo adjunto": {
            icon: "fa-paperclip",
            accent: "indigo",
            ayuda: "Documento o recurso adjunto."
        },
        notas_maestro: {
            icon: "fa-chalkboard-teacher",
            accent: "green",
            ayuda: "Guia docente para apoyar la clase."
        }
    };

    return meta[tipoNormalizado] || {
        icon: "fa-puzzle-piece",
        accent: "slate",
        ayuda: "Plantilla general de contenido."
    };
}

function obtenerEtiquetaSelectorModulo(tipo = "") {
    const tipoNormalizado = normalizarTipoModulo(tipo);
    const etiquetas = {
        quizz: "Interactivo",
        pagina: "Texto",
        temario: "Ruta",
        lectura: "Lectura",
        archivo: "Archivo",
        libro: "Capitulos",
        leccion: "Guiado",
        tarea: "Entrega",
        url: "Web",
        "archivo adjunto": "Adjunto",
        notas_maestro: "Docente"
    };

    return etiquetas[tipoNormalizado] || "Base";
}

function setModalSelectorModuloBusy(modal, busy = false) {
    if (!modal) return;
    const lista = modal.querySelector("#listaOpcionesModulo");
    const btnCancelar = modal.querySelector("#btnCancelarSelectorModulo");
    const btnCerrar = modal.querySelector("#btnCerrarSelectorModulo");
    const status = modal.querySelector("#selectorModuloStatus");

    modal.dataset.creating = busy ? "1" : "0";
    modal.setAttribute("aria-busy", busy ? "true" : "false");

    if (lista) {
        lista.querySelectorAll("[data-selector-modulo-card]").forEach((btn) => {
            btn.disabled = !!busy;
            btn.setAttribute("aria-disabled", busy ? "true" : "false");
        });
    }

    if (btnCancelar) {
        btnCancelar.disabled = !!busy;
    }

    if (btnCerrar) {
        btnCerrar.disabled = !!busy;
    }

    if (status) {
        status.classList.toggle("hidden", !busy);
    }
}

function cerrarSelectorModulo(modal) {
    if (!modal) return;
    setModalSelectorModuloBusy(modal, false);
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modal.dataset.creating = "0";
}

function mostrarSelectorModulo(subtema) {
    const tipos = [
        "Quizz",
        "Página",
        "Temario",
        "Lectura",
        "Archivo",
        "Libro",
        "Lección",
        "Tarea",
        "URL",
        "Archivo adjunto",
        "Notas del Maestro",
    ];

    const modal = document.getElementById("modalSelectorModulo");
    const lista = document.getElementById("listaOpcionesModulo");
    const btnCancelar = document.getElementById("btnCancelarSelectorModulo");
    const btnCerrar = document.getElementById("btnCerrarSelectorModulo");
    const status = document.getElementById("selectorModuloStatus");

    // Limpiar lista
    lista.innerHTML = "";
    if (status) {
        status.classList.add("hidden");
        status.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Creando módulo...</span>';
    }
    if (modal) {
        setModalSelectorModuloBusy(modal, false);
    }

    // Crear botones
    tipos.forEach(tipo => {
        const meta = obtenerMetaSelectorModulo(tipo);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.selectorModuloCard = "1";
        btn.className = `cb-selector-modulo-card cb-selector-modulo-card--${meta.accent}`;
        btn.innerHTML = `
            <span class="cb-selector-modulo-card__icon" aria-hidden="true">
                <i class="fas ${meta.icon}"></i>
            </span>
            <span class="cb-selector-modulo-card__body">
                <span class="cb-selector-modulo-card__title">${tipo}</span>
                <span class="cb-selector-modulo-card__meta">${obtenerEtiquetaSelectorModulo(tipo)}</span>
                <span class="cb-selector-modulo-card__help">${meta.ayuda}</span>
            </span>
            <span class="cb-selector-modulo-card__spinner" aria-hidden="true">
                <i class="fas fa-spinner fa-spin"></i>
            </span>
            <i class="fas fa-chevron-right cb-selector-modulo-card__chevron" aria-hidden="true"></i>
        `;

        btn.addEventListener("click", async (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            if (modal?.dataset?.creating === "1") return;
            setModalSelectorModuloBusy(modal, true);
            btn.classList.add("is-loading");
            if (status) {
                status.classList.remove("hidden");
            }

            try {
                const nuevoModuloId = crypto.randomUUID();

                const nuevoModulo = {
                    id: nuevoModuloId,
                    cursoId: curso.id,
                    subtemaId: subtema.id,
                    tipo,
                    nombre: tipo,
                    contenido: construirContenidoInicialModulo(tipo),
                    instrucciones: construirInstruccionesInicialesModulo(tipo),
                    incluirInstruccionOriginalEnPropuesta: false,
                    generarGrafico: false,
                    ignorarContextoOtrosModulos: false,
                    traducciones: [],
                    creado: Date.now(),
                    actualizado: Date.now()
                };

                await guardarModulo(nuevoModuloId, nuevoModulo, curso.id);

                // 📌 GUARDAR SOLO EL ID INTERNO EN EL SUBTEMA
                if (!subtema.modulosIds) subtema.modulosIds = [];
                subtema.modulosIds.push(nuevoModuloId);  // Solo el ID interno

                await guardarCursoFirebase();
                localStorage.setItem("moduloActivo", nuevoModuloId);
                renderTemas();
                const subtemaActual = obtenerSubtemaActualDesdeCurso(subtema.id) || subtema;
                await cargarSubtema(subtemaActual, nuevoModuloId);
                cerrarSelectorModulo(modal);
            } catch (error) {
                console.error("No se pudo crear el módulo:", error);
                alert(`No se pudo crear el módulo.\n${error?.message || ""}`);
            } finally {
                if (modal) setModalSelectorModuloBusy(modal, false);
                btn.classList.remove("is-loading");
                if (status) {
                    status.classList.add("hidden");
                }
            }
        });
        lista.appendChild(btn);
    });

    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    modal.dataset.creating = "0";

    // CANCELAR
    btnCancelar.onclick = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        cerrarSelectorModulo(modal);
    };

    if (btnCerrar) {
        btnCerrar.onclick = btnCancelar.onclick;
    }
}



async function duplicarSubtema(tema, subtemaOriginal) {
    // 1. Crear copia profunda del subtema
    const nuevoSubtema = JSON.parse(JSON.stringify(subtemaOriginal));

    // 2. Asignar nuevo ID
    nuevoSubtema.id = crypto.randomUUID();
    nuevoSubtema.nombre = subtemaOriginal.nombre + " (copia)";

    // 3. Regenerar IDs de módulos dentro del subtema
    nuevoSubtema.modulos = nuevoSubtema.modulos.map(mod => ({
        ...mod,
        id: crypto.randomUUID()
    }));

    // 4. Insertar la copia justo después del original
    const index = tema.subtemas.indexOf(subtemaOriginal);
    tema.subtemas.splice(index + 1, 0, nuevoSubtema);

    // 5. Guardar y recargar
    await guardarCursoFirebase();
    renderTemas();

    // 6. Abrir el subtema duplicado automáticamente
    setTimeout(() => {
        cargarSubtema(nuevoSubtema);
    }, 200);
}



export async function obtenerModulo(moduloId, cursoIdEspecifico = null, options = {}) {
    // Determinar cursoId
    let cursoIdParaBuscar = cursoIdEspecifico || (curso ? curso.id : null);
    const forceRefresh = options?.forceRefresh === true;
    
    if (!cursoIdParaBuscar) {
        return null;
    }
    
    const idParaBuscar = construirDocIdModulo(moduloId, cursoIdParaBuscar);
    if (!idParaBuscar) return null;

    const cached = modulosCache.get(idParaBuscar);
    if (cached && !forceRefresh) {
        return cached;
    }
    
    
    const docRef = doc(db, "moodleCourses", idParaBuscar);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const data = snap.data();
        
        // Asegurar que el ID interno esté presente
        if (!data.id) {
            data.id = extraerIdInternoModulo(idParaBuscar, cursoIdParaBuscar);
        }
        
        modulosCache.set(idParaBuscar, data);
        return data;
    } else {
        
        // Intentar con el ID original (por compatibilidad)
        if (moduloId !== idParaBuscar) {
            const docRefOriginal = doc(db, "moodleCourses", moduloId);
            const snapOriginal = await getDoc(docRefOriginal);
            
            if (snapOriginal.exists()) {
                const data = snapOriginal.data();
                if (!data.id) data.id = moduloId;
                modulosCache.set(idParaBuscar, data);
                return data;
            }
        }
        
        return null;
    }
}


// Función auxiliar para normalizar IDs
function normalizarIdModulo(moduloId, paraFirestore = false) {
    if (!moduloId) return null;
    
    // Si ya tiene el formato correcto
    if (moduloId.includes('_')) {
        return moduloId;
    }
    
    // Si no, construir el formato
    if (curso && curso.id) {
        if (paraFirestore) {
            // Para Firestore: curso.id_moduloId
            return `${curso.id}_${moduloId}`;
        } else {
            // Para arrays: solo el ID interno
            return moduloId;
        }
    }
    
    return moduloId;
}

function esErrorTamanoFirestore(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("exceeds the maximum allowed size")
        || msg.includes("cannot be written because its size")
        || msg.includes("maximum allowed size");
}

function limpiarDataUrlsPesadas(texto = "") {
    return String(texto || "")
        // Remover imágenes base64 embebidas en tags <img>.
        .replace(/<img[^>]+src=["']data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+["'][^>]*>/gi, "[Imagen embebida removida por límite de tamaño]")
        // Remover data URLs sueltas.
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "[data:image removida]")
        .trim();
}

function recortarTextoSeguro(texto = "", maxChars = 240000) {
    const limpio = limpiarDataUrlsPesadas(texto);
    if (limpio.length <= maxChars) return limpio;
    return `${limpio.slice(0, maxChars)}\n\n[Contenido recortado automáticamente por límite de tamaño del documento]`;
}

function sanitizarTraducciones(traducciones) {
    if (!Array.isArray(traducciones)) return [];
    return traducciones.slice(0, 12).map((t) => ({
        ...t,
        contenido: recortarTextoSeguro(sanitizarHtmlEditorial(t?.contenido || ""), 120000)
    }));
}

function sanitizarInstruccionesModuloPersistibles(html = "") {
    return recortarTextoSeguro(
        sanitizarHtmlEditorial(limpiarDataUrlsInstruccionesGemini(html)),
        160000
    );
}

function quitarUndefinedPlano(obj = {}) {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (v !== undefined) out[k] = v;
    });
    return out;
}

export function sincronizarModuloLocal(moduloId, cursoId, payload = {}) {
    const moduloIdSafe = String(moduloId || "").trim();
    const cursoIdSafe = String(cursoId || "").trim();
    if (!moduloIdSafe || !payload || typeof payload !== "object") return;

    const syncArray = (items) => {
        if (!Array.isArray(items)) return false;
        let updated = false;
        items.forEach((item) => {
            if (!item || typeof item !== "object") return;
            const itemId = String(item.id || "").trim();
            const itemFullId = construirDocIdModulo(itemId, cursoIdSafe);
            
            // Comparar tanto contra ID corto como largo para mayor robustez
            if (itemId === moduloIdSafe || itemFullId === moduloIdSafe || itemId === moduloIdSafe.split('_').pop()) {
                Object.assign(item, payload);
                updated = true;
            }
        });
        return updated;
    };

    if (window.subtemaActivo?.modulos) {
        syncArray(window.subtemaActivo.modulos);
    }

    if (curso?.temas && Array.isArray(curso.temas)) {
        curso.temas.forEach((tema) => {
            if (!Array.isArray(tema?.subtemas)) return;
            tema.subtemas.forEach((subtema) => {
                if (!Array.isArray(subtema?.modulos)) return;
                syncArray(subtema.modulos);
            });
        });
    }

    if (cursoIdSafe) {
        const docId = construirDocIdModulo(moduloIdSafe, cursoIdSafe);
        if (docId) {
            const current = modulosCache.get(docId) || {};
            modulosCache.set(docId, { ...current, ...payload });
        }
    }
}

async function reintentarGuardadoModuloReduciendoTamano({
    docRef,
    snap,
    moduloId,
    cursoIdParaGuardar,
    cambios
}) {
    const actual = snap?.exists() ? (snap.data() || {}) : {};
    const cambiosBase = { ...(cambios || {}) };

    if (Object.prototype.hasOwnProperty.call(cambiosBase, "instrucciones")) {
        cambiosBase.instrucciones = sanitizarInstruccionesModuloPersistibles(cambiosBase.instrucciones);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "instruccionesImagenes")) {
        cambiosBase.instruccionesImagenes = sanitizarInstruccionesImagenes(cambiosBase.instruccionesImagenes);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "contenido")) {
        cambiosBase.contenido = recortarTextoSeguro(normalizarContenidoModuloPersistible(cambiosBase.contenido), 280000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "notasMaestro")) {
        cambiosBase.notasMaestro = recortarTextoSeguro(sanitizarHtmlEditorial(cambiosBase.notasMaestro), 180000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "contenidoGenerado")) {
        cambiosBase.contenidoGenerado = recortarTextoSeguro(sanitizarHtmlEditorial(cambiosBase.contenidoGenerado), 180000);
    }
    if (Object.prototype.hasOwnProperty.call(cambiosBase, "traducciones")) {
        cambiosBase.traducciones = sanitizarTraducciones(cambiosBase.traducciones);
    }

    const payloadRescate = quitarUndefinedPlano({
        ...cambiosBase,
        instrucciones: recortarTextoSeguro(
            sanitizarInstruccionesModuloPersistibles(cambiosBase.instrucciones ?? actual.instrucciones ?? ""),
            160000
        ),
        instruccionesImagenes: sanitizarInstruccionesImagenes(
            cambiosBase.instruccionesImagenes ?? actual.instruccionesImagenes ?? []
        ),
        contenido: recortarTextoSeguro(
            normalizarContenidoModuloPersistible(cambiosBase.contenido ?? actual.contenido ?? ""),
            280000
        ),
        notasMaestro: recortarTextoSeguro(
            sanitizarHtmlEditorial(cambiosBase.notasMaestro ?? actual.notasMaestro ?? ""),
            180000
        ),
        contenidoGenerado: recortarTextoSeguro(
            sanitizarHtmlEditorial(cambiosBase.contenidoGenerado ?? actual.contenidoGenerado ?? ""),
            180000
        ),
        traducciones: sanitizarTraducciones(
            cambiosBase.traducciones ?? actual.traducciones ?? []
        ),
        actualizado: Date.now(),
        cursoId: cursoIdParaGuardar,
        ultimaModificacion: new Date().toISOString(),
        modificadoPor: currentUserId,
        id: extraerIdInternoModulo(moduloId, cursoIdParaGuardar)
    });

    if (snap.exists()) {
        await updateDoc(docRef, payloadRescate);
    } else {
        await setDoc(docRef, {
            creado: Date.now(),
            ...payloadRescate
        });
    }

    return payloadRescate;
}


export async function guardarModulo(moduloId, cambios, cursoIdEspecifico = null) {
    try {
        // Determinar qué cursoId usar
        let cursoIdParaGuardar = cursoIdEspecifico || (curso ? curso.id : null);
        
        if (!cursoIdParaGuardar) {
            throw new Error("No hay cursoId especificado");
        }
        
        // Crear el ID del documento
        const docId = construirDocIdModulo(moduloId, cursoIdParaGuardar);
        if (!docId) throw new Error("No se pudo construir docId del módulo");
        const docRef = doc(db, "moodleCourses", docId);
        
        // Primero verificar si existe
        const snap = await getDoc(docRef);
        
        const cambiosSanitizados = { ...(cambios || {}) };
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "instrucciones")) {
            cambiosSanitizados.instrucciones = sanitizarInstruccionesModuloPersistibles(cambiosSanitizados.instrucciones);
        }
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "instruccionesImagenes")) {
            cambiosSanitizados.instruccionesImagenes = sanitizarInstruccionesImagenes(cambiosSanitizados.instruccionesImagenes);
        }
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "contenido")) {
            cambiosSanitizados.contenido = normalizarContenidoModuloPersistible(cambiosSanitizados.contenido);
        }
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "notasMaestro")) {
            cambiosSanitizados.notasMaestro = sanitizarHtmlEditorial(cambiosSanitizados.notasMaestro);
        }
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "contenidoGenerado")) {
            cambiosSanitizados.contenidoGenerado = sanitizarHtmlEditorial(cambiosSanitizados.contenidoGenerado);
        }
        if (Object.prototype.hasOwnProperty.call(cambiosSanitizados, "traducciones")) {
            cambiosSanitizados.traducciones = sanitizarTraducciones(cambiosSanitizados.traducciones);
        }

        const datosActualizados = {
            ...cambiosSanitizados,
            actualizado: Date.now(),
            cursoId: cursoIdParaGuardar,
            // 🔥 Añadir timestamp para sincronización
            ultimaModificacion: new Date().toISOString(),
            // 🔥 Añadir ID del usuario que modificó
            modificadoPor: currentUserId
        };
        
        // Si no tiene ID en los datos, agregarlo
        if (!datosActualizados.id) {
            datosActualizados.id = extraerIdInternoModulo(moduloId, cursoIdParaGuardar);
        }
        
        if (snap.exists()) {
            await updateDoc(docRef, datosActualizados);
            const payloadLocal = {
                ...snap.data(),
                ...datosActualizados
            };
            modulosCache.set(docId, payloadLocal);
            sincronizarModuloLocal(moduloId, cursoIdParaGuardar, payloadLocal);
        } else {
            // Si no existe, crear con datos básicos
            const dataNuevo = {
                id: extraerIdInternoModulo(moduloId, cursoIdParaGuardar),
                cursoId: cursoIdParaGuardar,
                creado: Date.now(),
                ...datosActualizados
            };
            await setDoc(docRef, dataNuevo);
            modulosCache.set(docId, dataNuevo);
            sincronizarModuloLocal(moduloId, cursoIdParaGuardar, dataNuevo);
        }
        
        return true;
    } catch (error) {
        if (esErrorTamanoFirestore(error)) {
            const docId = construirDocIdModulo(moduloId, cursoIdEspecifico || (curso ? curso.id : null));
            const cursoIdParaGuardar = cursoIdEspecifico || (curso ? curso.id : null);
            if (!docId || !cursoIdParaGuardar) throw error;

            const docRef = doc(db, "moodleCourses", docId);
            const snap = await getDoc(docRef);

            const payloadRescate = await reintentarGuardadoModuloReduciendoTamano({
                docRef,
                snap,
                moduloId,
                cursoIdParaGuardar,
                cambios
            });

            modulosCache.set(docId, {
                ...(snap.exists() ? snap.data() : {}),
                ...payloadRescate
            });
            sincronizarModuloLocal(moduloId, cursoIdParaGuardar, payloadRescate);
            return true;
        }
        throw error;
    }
}


window.editarModulo = async function (moduloId) {
    const sub = subtemaActivo;
    const modulo = await obtenerModulo(moduloId);

    // Crear modal para editar contenido del módulo
    const modalHTML = `
        <div id="modalEditContenidoModulo" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
            <div class="bg-white rounded-lg p-6 w-full max-w-2xl cb-modal-scroll-80">
                <h3 class="text-lg font-semibold mb-4">Editar contenido del módulo: ${modulo.nombre}</h3>
                <textarea 
                    id="inputEditContenidoModulo" 
                    placeholder="Contenido HTML del módulo"
                    class="w-full p-3 border border-gray-300 rounded mb-4 font-mono text-sm"
                    rows="15"
                >${modulo.contenido || ""}</textarea>
                <div class="flex justify-end gap-2">
                    <button 
                        id="btnCancelarEditContenidoModulo"
                        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancelar
                    </button>
                    <button 
                        id="btnConfirmarEditContenidoModulo"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById("modalEditContenidoModulo");
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById("modalEditContenidoModulo");
    const textarea = document.getElementById("inputEditContenidoModulo");
    const btnCancelar = document.getElementById("btnCancelarEditContenidoModulo");
    const btnConfirmar = document.getElementById("btnConfirmarEditContenidoModulo");
    
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    setTimeout(() => textarea.focus(), 100);
    
    const nuevoContenido = await new Promise((resolve) => {
        const limpiar = () => {
            btnConfirmar.onclick = null;
            btnCancelar.onclick = null;
        };
        
        btnConfirmar.onclick = () => {
            const valor = textarea.value;
            limpiar();
            modal.classList.add("hidden");
            resolve(valor);
        };
        
        btnCancelar.onclick = () => {
            limpiar();
            modal.classList.add("hidden");
            resolve(null);
        };
        
        modal.onkeydown = (e) => {
            if (e.key === 'Escape') btnCancelar.click();
        };
    });
    
    setTimeout(() => modal.remove(), 300);
    
    if (nuevoContenido === null) return; // cancelar

    await guardarModulo(moduloId, { contenido: nuevoContenido });
    cargarSubtema(subtemaActivo);
};


let ultimoAnalisis = 0;

function puedeAnalizar() {
    const ahora = Date.now();
    if (ahora - ultimoAnalisis < 5000) {
        return false; // 5 segundos
    }
    ultimoAnalisis = ahora;
    return true;
}


window.analizarModulo = async function (moduloId) {
    
    if (!puedeAnalizar()) {
        mostrarModalAnalisis(`
            <div class="p-4 text-yellow-700 bg-yellow-100 border border-yellow-300 rounded">
                Estás solicitando análisis demasiado rápido.  
                Espera 5 segundos antes de volver a analizar.
            </div>
        `);
        return;
    }

    const sub = subtemaActivo;
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) return;

    mostrarModalAnalisis(`
        <div class="flex items-center gap-2 text-blue-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i>
            Analizando coherencia del módulo...
        </div>
    `);

    try {
        const endpoint = getGeminiEndpoint();

const prompt = `
Eres un experto en análisis pedagógico, lingüístico y didáctico.
anliza el módulo en busca de contenido falso, incoherente o contradictorio.
 -Evalúa la coherencia del módulo.  
 -Verificar datos incorrectos
 -Detectar afirmaciones dudosas
 -Señalar números no sustentados
 -Proponer correcciones
 -Marcar incoherencias

⚠ INSTRUCCIONES IMPORTANTES:
- NO devuelvas JSON  
- NO devuelvas markdown  
- NO uses código ni bloques con \`\`\`html
- NO uses comillas " "  
- NO uses llaves {}  
- NO uses formato de objeto  
- NO devuelvas text/json ni nada similar  

✔ Devuelve SOLO **HTML puro**, exactamente con esta estructura:

<div class="analisis-contenedor">

  <h3 class="analisis-title">Sinopsis del contenido</h3>
  <div class="sinopsis">
    Resumen breve del contenido
  </div>

  <h3 class="analisis-title">Resultado del análisis</h3>
  <div class="estado">[COHERENTE]</div>

  <div class="justificacion">
    Texto explicando por qué es coherente o incoherente.
  </div>

<h3 class="analisis-title">Oportunidades de mejora</h3>

  <div class="oportunidades-mejora">
    Oportunidades para mejorar el contenido.
  </div>

</div>


CONTENIDO A ANALIZAR:
##########################################
${modulo.contenido || "(Vacío)"}
##########################################
`;


        const body = {
            contents: [
                { parts: [ { text: prompt } ] }
            ]
        };

        const { response: res, data } = await geminiGenerateRequest(body);
        if (!res.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${res.status}`));
        }
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";

        mostrarModalAnalisis(txt);

    } catch (err) {
        mostrarModalAnalisis(`
            <div class="text-red-600">Error al analizar el módulo</div>
            <pre>${err}</pre>
        `);
    }
};



window.mostrarModalAnalisis = function (html) {
    const modal = document.getElementById("modalAnalisisModulo");
    const cont = document.getElementById("contenidoAnalisisModulo");

    cont.innerHTML = html;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}



window.cerrarModalAnalisis = function () {
    const modal = document.getElementById("modalAnalisisModulo");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}


window.traducirContenidoSubtema = async function (subtema, idioma) {

    const contPrev = document.getElementById("contenidoTraduccionSubtema");

    if (!subtema.contenidoGenerado || subtema.contenidoGenerado.trim() === "") {
        contPrev.innerHTML = `<p class="text-red-500 text-sm">No hay contenido generado para traducir.</p>`;
        return;
    }

    contPrev.innerHTML = `
        <div class="flex items-center gap-2 text-teal-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i>
            Traduciendo contenido al idioma ${idioma}...
        </div>
    `;

    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
Traduce el siguiente contenido HTML al idioma ${idioma}.
- Mantener formato HTML exacto.
- NO inventar contenido nuevo.
- Solo traducir texto visible.

###########################################
${subtema.contenidoGenerado}
###########################################
        `;

        const { response: res, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });
        if (!res.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${res.status}`));
        }
        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";

        texto = texto.replace(/```html/gi, "").replace(/```/g, "");

        // =============================
        // ✔ GUARDAR EN EL SUBTEMA
        // =============================
        if (!subtema.traducciones) subtema.traducciones = [];

        subtema.traducciones.push({
            id: crypto.randomUUID(),
            idioma,
            contenido: texto
        });

        await guardarCursoFirebase();

        // =============================
        // ✔ MOSTRAR EN EL MODAL
        // =============================
        contPrev.innerHTML = sanitizarHtmlEditorial(texto);

        // activar menú contextual
        setTimeout(() => activarAccionesEnParrafos(), 50);
        

    } catch (err) {
        contPrev.replaceChildren();
        const errorTitle = document.createElement("div");
        errorTitle.className = "text-red-600";
        errorTitle.textContent = "Error al traducir";
        const errorBody = document.createElement("pre");
        errorBody.className = "text-xs";
        errorBody.textContent = String(err?.stack || err?.message || err || "");
        contPrev.append(errorTitle, errorBody);
    }
};

window.cerrarModalTraducirSubtema = function () {
    const modal = document.getElementById("modalTraducirSubtema");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

function inicializarModalTraduccionSubtema() {
    const modal = document.getElementById("modalTraducirSubtema");
    const btnAceptar = document.getElementById("btnAceptarTraduccionSubtema");
    const selectIdioma = document.getElementById("selectIdiomaSubtema");

    if (!modal || !btnAceptar || !selectIdioma) return;
    if (modal.dataset.bindTradSubtema === "1") return;
    modal.dataset.bindTradSubtema = "1";

    btnAceptar.addEventListener("click", async () => {
        const subtema = window.__subtemaTraduciendo;
        const idioma = selectIdioma.value;

        if (!subtema) {
            alert("No hay subtema seleccionado.");
            return;
        }
        if (!idioma) {
            alert("Selecciona un idioma.");
            return;
        }

        await window.traducirContenidoSubtema(subtema, idioma);
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            window.cerrarModalTraducirSubtema();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) {
            window.cerrarModalTraducirSubtema();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarModalTraduccionSubtema);
} else {
    inicializarModalTraduccionSubtema();
}

window.renderListadoTraduccionesSubtema = function (subtema) {
    const cont = document.getElementById("listaTraduccionesSubtema");

    if (!cont) return;

    if (!subtema.traducciones || subtema.traducciones.length === 0) {
        cont.innerHTML = `<p class="text-muted-foreground text-sm">No hay traducciones registradas.</p>`;
        return;
    }

    cont.innerHTML = subtema.traducciones.map(t => `
        <div class="p-3 border border-border rounded mb-2 flex justify-between items-center">
            <p class="font-semibold text-sm text-foreground">${t.idioma}</p>

            <div class="flex gap-3 text-sm">
                <span class="text-primary cursor-pointer"
                    data-mc-action="abrir-traduccion-subtema"
                    data-mc-translation-id="${escapeHtml(t.id)}">Ver</span>

                <span class="text-destructive cursor-pointer"
                    data-mc-action="eliminar-traduccion-subtema"
                    data-mc-translation-id="${escapeHtml(t.id)}">Eliminar</span>
            </div>
        </div>
    `).join("");
};




window.traducirModulo = async function(moduloId) {
    const modulo = await obtenerModulo(moduloId);
    if (!modulo) return;

    // ✅ GUARDAR ESTE MÓDULO COMO ACTIVO EN localStorage
    localStorage.setItem("moduloActivo", moduloId);
    
    // Establecer el módulo en traducción
    window.__moduloTraduciendo = modulo;
    
    // Mostrar el modal de traducción
    const modal = document.getElementById("modalTraduccionModulo");
    const select = document.getElementById("selectIdiomaTraduccion");
    const cont = document.getElementById("contenidoTraduccionModulo");
    
    // Resetear el modal
    select.value = "";
    cont.innerHTML = `<p class="text-gray-400 text-sm">Aquí aparecerá la traducción del módulo.</p>`;
    delete cont.dataset.traduccionId;
    delete cont.dataset.moduloId;
    actualizarBotonAplicarTraduccionModulo();
    
    // Cargar traducciones existentes
    if (modulo.traducciones && modulo.traducciones.length > 0) {
        renderListadoTraducciones(modulo);
    } else {
        const listaCont = document.getElementById("listaTraduccionesExistentes");
        if (listaCont) {
            listaCont.innerHTML = `<p class="text-gray-400 text-sm">No hay traducciones aún.</p>`;
        }
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};




document.getElementById("btnGenerarTraduccion").onclick = async function () {
    const idioma = document.getElementById("selectIdiomaTraduccion").value;
    if (!idioma) {
        alert("Selecciona un idioma.");
        return;
    }

    // ✅ USAR window.__moduloTraduciendo en lugar de buscar en localStorage
    const modulo = window.__moduloTraduciendo;
    
    if (!modulo) {
        alert("No hay módulo seleccionado para traducir.");
        return;
    }

    document.getElementById("contenidoTraduccionModulo").innerHTML = `
        <div class="flex items-center gap-2 text-teal-600 text-sm">
            <i class="fas fa-spinner fa-spin"></i> Generando traducción...
        </div>
    `;

    try {
        const endpoint = getGeminiEndpoint();

        const prompt = `
Traduce el siguiente contenido al idioma ${idioma}.
Reglas:
- Traducción natural, NO literal.
- Mantener formato HTML.
- NO inventes contenido nuevo.
- Devuelve solo el contenido traducido final.
- NO copies ni repitas separadores, almohadillas, delimitadores ni marcadores técnicos.

Contenido:
${modulo.contenido || "(Vacío)"}
        `;

        const { response: res, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });
        if (!res.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${res.status}`));
        }
        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta";
        const textoLimpio = limpiarRespuestaTraduccionModulo(texto, modulo.tipo || "");

        // guardar traducción en Firestore (documento del módulo)
        const nueva = {
            id: crypto.randomUUID(),
            idioma,
            contenido: textoLimpio
        };

        const nuevasTraducciones = Array.isArray(modulo.traducciones)
            ? [...modulo.traducciones, nueva]
            : [nueva];

        await guardarModulo(modulo.id, { traducciones: nuevasTraducciones });

        // refrescar objeto local
        modulo.traducciones = nuevasTraducciones;

        // actualizar modal
        renderListadoTraducciones(modulo);

        // mostrar traducción
        document.getElementById("contenidoTraduccionModulo").innerHTML = textoLimpio || `<p class="text-gray-400 text-sm">Sin contenido traducido.</p>`;
        document.getElementById("contenidoTraduccionModulo").dataset.traduccionId = nueva.id;
        document.getElementById("contenidoTraduccionModulo").dataset.moduloId = modulo.id;
        actualizarBotonAplicarTraduccionModulo({ traduccionId: nueva.id, moduloId: modulo.id });

    } catch (err) {
        const contenedorTraduccion = document.getElementById("contenidoTraduccionModulo");
        if (contenedorTraduccion) {
            contenedorTraduccion.replaceChildren();
            const errorTitle = document.createElement("div");
            errorTitle.className = "text-red-600";
            errorTitle.textContent = "Error al traducir";
            const errorBody = document.createElement("pre");
            errorBody.textContent = String(err?.stack || err?.message || err || "");
            contenedorTraduccion.append(errorTitle, errorBody);
            actualizarBotonAplicarTraduccionModulo();
        }
    }
};

window.abrirTraduccionSubtema = function (idTraduccion) {
    const subtema = window.subtemaActivo;
    if (!subtema || !subtema.traducciones) return;

    const t = subtema.traducciones.find(x => x.id === idTraduccion);
    if (!t) return;

    const cont = document.getElementById("contenidoTraduccionSubtema");
    if (!cont) return;

        cont.innerHTML = sanitizarHtmlEditorial(t.contenido);
    cont.dataset.traduccionId = idTraduccion;


    // Activar edición de párrafos
    setTimeout(() => activarAccionesEnParrafos(), 50);

    // Efecto visual
    cont.classList.add("highlight-pulse");
    setTimeout(() => cont.classList.remove("highlight-pulse"), 1500);
};



window.eliminarTraduccionSubtema = async function (idTraduccion) {
    const subtema = window.subtemaActivo;
    if (!subtema || !subtema.traducciones) return;

    // Confirmación
    if (!confirm("¿Eliminar esta traducción?")) return;

    // Eliminar del array
    subtema.traducciones = subtema.traducciones.filter(t => t.id !== idTraduccion);

    // Guardar en Firebase
    if (typeof guardarCursoFirebase === "function") {
        await guardarCursoFirebase();
    }

    // Refrescar listado
    if (typeof renderListadoTraduccionesSubtema === "function") {
        renderListadoTraduccionesSubtema(subtema);
    }

    // Limpiar vista previa si estabas viendo esa traducción
    const cont = document.getElementById("contenidoTraduccionSubtema");
    if (cont) cont.innerHTML = `<p class="text-gray-400 text-sm">Selección eliminada.</p>`;
};


// Asegúrate de que esta función esté definida GLOBALMENTE, no dentro de otro scope
window.renderListadoTraducciones = function(modulo) {
    const cont = document.getElementById("listaTraduccionesExistentes");
    
    if (!cont) {
        return;
    }
    
    if (!modulo.traducciones || modulo.traducciones.length === 0) {
        cont.innerHTML = `<p class="text-gray-400 text-sm">No hay traducciones aún.</p>`;
        return;
    }

    const html = modulo.traducciones.map(t => `
        <div class="p-3 border rounded mb-2 flex justify-between items-center bg-gray-50">
            <div>
                <p class="font-semibold text-sm">${t.idioma}</p>
                <p class="text-xs text-gray-500 truncate cb-max-w-200">
                    ${t.contenido.substring(0, 50)}${t.contenido.length > 50 ? '...' : ''}
                </p>
            </div>
            <div class="flex gap-3 text-sm">
                <span class="text-blue-600 cursor-pointer hover:text-blue-800"
                    data-mc-action="abrir-traduccion"
                    data-mc-translation-id="${escapeHtml(t.id)}"
                    data-mc-modulo-id="${escapeHtml(modulo.id)}">Ver</span>
                <span class="text-emerald-600 cursor-pointer hover:text-emerald-800"
                    data-mc-action="aplicar-traduccion"
                    data-mc-translation-id="${escapeHtml(t.id)}"
                    data-mc-modulo-id="${escapeHtml(modulo.id)}">Aplicar</span>
                <span class="text-red-600 cursor-pointer hover:text-red-800"
                    data-mc-action="eliminar-traduccion"
                    data-mc-translation-id="${escapeHtml(t.id)}"
                    data-mc-modulo-id="${escapeHtml(modulo.id)}">Eliminar</span>
            </div>
        </div>
    `).join("");

    cont.innerHTML = html;
};

function actualizarBotonAplicarTraduccionModulo({ traduccionId = "", moduloId = "" } = {}) {
    const btn = document.getElementById("btnAplicarTraduccionModulo");
    if (!btn) return;
    const hasSelection = !!String(traduccionId || "").trim() && !!String(moduloId || "").trim();
    btn.disabled = !hasSelection;
    if (hasSelection) {
        btn.dataset.traduccionId = String(traduccionId || "").trim();
        btn.dataset.moduloId = String(moduloId || "").trim();
    } else {
        delete btn.dataset.traduccionId;
        delete btn.dataset.moduloId;
    }
}


window.abrirTraduccion = async function (idTraduccion, moduloId = null) {
    let modulo = window.__moduloTraduciendo;
    
    // Si no tenemos el módulo en memoria o se especifica un ID diferente
    if (!modulo || (moduloId && modulo.id !== moduloId)) {
        if (moduloId) {
            modulo = await obtenerModulo(moduloId);
        } else {
            // Buscar entre todos los módulos del subtema activo
            const sub = subtemaActivo;
            if (!sub || !sub.modulosIds) return;

            for (const modId of sub.modulosIds) {
                const m = await obtenerModulo(modId);
                if (m && m.traducciones) {
                    const t = m.traducciones.find(tr => tr.id === idTraduccion);
                    if (t) {
                        modulo = m;
                        break;
                    }
                }
            }
        }
    }

    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    const traduccion = modulo.traducciones.find(t => t.id === idTraduccion);
    if (!traduccion) {
        alert("No se encontró la traducción.");
        return;
    }

    // Insertar contenido en el modal
    const cont = document.getElementById("contenidoTraduccionModulo");
    if (cont) {
        cont.innerHTML = limpiarRespuestaTraduccionModulo(traduccion.contenido, modulo.tipo || "");
        cont.dataset.traduccionId = idTraduccion;
        cont.dataset.moduloId = modulo.id;
    }
    actualizarBotonAplicarTraduccionModulo({ traduccionId: idTraduccion, moduloId: modulo.id });

    // Activar menú contextual
    setTimeout(() => activarAccionesEnParrafos(), 50);
};

window.aplicarTraduccionAlModulo = async function (idTraduccion, moduloId = null) {
    let modulo = moduloId ? await obtenerModulo(moduloId) : window.__moduloTraduciendo;
    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    const traduccion = Array.isArray(modulo.traducciones)
        ? modulo.traducciones.find((t) => t.id === idTraduccion)
        : null;
    if (!traduccion) {
        alert("No se encontró la traducción.");
        return;
    }

    if (!confirm(`¿Aplicar la traducción en ${traduccion.idioma} al contenido del módulo?`)) return;

    const contenidoAplicable = limpiarRespuestaTraduccionModulo(traduccion.contenido, modulo.tipo || "");
    await guardarModulo(modulo.id, { contenido: contenidoAplicable }, modulo.cursoId || null);
    modulo.contenido = contenidoAplicable;
    window.__moduloTraduciendo = modulo;

    const contModulo = document.getElementById(`contenido-${modulo.id}`);
    if (contModulo) {
        contModulo.innerHTML = contenidoAplicable;
    }

    const contPreview = document.getElementById("contenidoTraduccionModulo");
    if (contPreview) {
        contPreview.innerHTML = contenidoAplicable;
        contPreview.dataset.traduccionId = idTraduccion;
        contPreview.dataset.moduloId = modulo.id;
    }

    actualizarBotonAplicarTraduccionModulo({ traduccionId: idTraduccion, moduloId: modulo.id });
    mostrarNotificacion("✅ Traducción aplicada al módulo", "success");
};


window.eliminarTraduccion = async function (idTraduccion, moduloId = null) {
    let modulo = moduloId ? await obtenerModulo(moduloId) : window.__moduloTraduciendo;
    
    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }

    if (!confirm("¿Eliminar esta traducción?")) return;

    // Eliminar la traducción del array
    modulo.traducciones = modulo.traducciones.filter(t => t.id !== idTraduccion);

    // Guardar en Firebase
    await guardarModulo(modulo.id, { traducciones: modulo.traducciones });

    // Refrescar listado
    window.renderListadoTraducciones(modulo);

    // Limpiar contenido de vista previa si es la traducción que se está viendo
    const cont = document.getElementById("contenidoTraduccionModulo");
    if (cont && cont.dataset.traduccionId === idTraduccion) {
        cont.innerHTML = `<p class="text-gray-400 text-sm">Traducción eliminada.</p>`;
        delete cont.dataset.traduccionId;
        delete cont.dataset.moduloId;
        actualizarBotonAplicarTraduccionModulo();
    }
};



window.mostrarModalTraduccion = function (html) {
    const modal = document.getElementById("modalTraduccionModulo");
    const cont = document.getElementById("contenidoTraduccionModulo");

    cont.innerHTML = html;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

window.cerrarModalTraduccion = function () {
    const modal = document.getElementById("modalTraduccionModulo");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    actualizarBotonAplicarTraduccionModulo();
};

const btnAplicarTraduccionModulo = document.getElementById("btnAplicarTraduccionModulo");
if (btnAplicarTraduccionModulo && btnAplicarTraduccionModulo.dataset.cbBound !== "1") {
    btnAplicarTraduccionModulo.dataset.cbBound = "1";
    btnAplicarTraduccionModulo.addEventListener("click", async () => {
        const traduccionId = btnAplicarTraduccionModulo.dataset.traduccionId || "";
        const moduloId = btnAplicarTraduccionModulo.dataset.moduloId || "";
        if (!traduccionId || !moduloId) return;
        await window.aplicarTraduccionAlModulo?.(traduccionId, moduloId);
    });
}

// Asegúrate de que este código se ejecute al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    const btnCancelarTraduccion = document.getElementById("btnCancelarTraduccion");
    if (btnCancelarTraduccion) {
        btnCancelarTraduccion.onclick = function() {
            document.getElementById("modalTraduccionModulo").classList.add("hidden");
        };
    }
});
// Variable global para almacenar el ID del módulo actual y el contenido generado
// Variable global para almacenar el ID del módulo actual y el contenido generado
let moduloTonoActual = null;
let contenidoGeneradoTono = null;

// Definir las descripciones de cada tono - VERSIÓN COMPLETA
const descripcionesTono = {
    // Estilo Formal
    academico: {
        titulo: "ACADÉMICO",
        descripcion: "Formal, riguroso, preciso. Usa terminología especializada, referencias académicas y estructura lógica. Ideal para textos universitarios o científicos."
    },
    cientifico: {
        titulo: "CIENTÍFICO",
        descripcion: "Objetivo, preciso, basado en evidencia. Usa terminología técnica, datos verificables y metodología clara. Formato impersonal y neutral."
    },
    
    // Estilo Informativo
    periodistico: {
        titulo: "PERIODÍSTICO",
        descripcion: "Claro, directo, objetivo. Presenta hechos de manera neutral, responde a las preguntas básicas (qué, quién, cuándo, dónde, por qué). Estructura de pirámide invertida."
    },
    informativo: {
        titulo: "INFORMATIVO",
        descripcion: "Claro, didáctico, organizado. Explica conceptos complejos de manera accesible. Usa ejemplos concretos y estructura lógica para facilitar la comprensión."
    },
    
    // Estilo Literario
    literario: {
        titulo: "LITERARIO",
        descripcion: "Creativo, expresivo, evocador. Usa recursos literarios (metáforas, símiles, imágenes sensoriales). Enfocado en la belleza del lenguaje y la experiencia emocional."
    },
    narrativo: {
        titulo: "NARRATIVO",
        descripcion: "Con estructura de historia. Usa elementos narrativos (personajes, conflicto, desarrollo, resolución). Ideal para contar experiencias o casos de estudio."
    },
    poetico: {
        titulo: "POÉTICO",
        descripcion: "Rítmico, metafórico, conciso. Usa imágenes potentes, sonoridad del lenguaje y economía de palabras. Enfocado en la experiencia sensorial y emocional."
    },
    
    // Estilo Conversacional
    amigable: {
        titulo: "AMIGABLE",
        descripcion: "Cálido, cercano, accesible. Usa un tono conversacional como si estuvieras hablando con un amigo. Incluye preguntas retóricas y ejemplos cotidianos."
    },
    coloquial: {
        titulo: "COLOQUIAL",
        descripcion: "Natural, informal, espontáneo. Usa lenguaje cotidiano, contracciones y expresiones comunes. Como una conversación real entre personas."
    },
    
    // Estilo Educativo
    infantil: {
        titulo: "INFANTIL",
        descripcion: "Simple, motivador, lúdico. Usa lenguaje muy sencillo, ejemplos visuales, repeticiones y elementos interactivos. Ideal para niños pequeños."
    },
    simple: {
        titulo: "SIMPLE",
        descripcion: "Claro, directo, sin complicaciones. Usa frases cortas, vocabulario básico y estructura lineal. Perfecto para principiantes o explicaciones básicas."
    },
    didactico: {
        titulo: "DIDÁCTICO",
        descripcion: "Pedagógico, estructurado, progresivo. Divide la información en pasos, incluye ejemplos prácticos y ejercicios de aplicación. Enfocado en el aprendizaje."
    },
    
    // Estilo Especializado
    tecnico: {
        titulo: "TÉCNICO",
        descripcion: "Especializado, preciso, funcional. Usa terminología específica del campo, especificaciones técnicas y detalles operativos. Enfocado en la aplicación práctica."
    },
    formal: {
        titulo: "FORMAL",
        descripcion: "Respetuoso, protocolario, estructurado. Usa fórmulas de cortesía, estructura jerárquica y lenguaje impersonal. Ideal para documentos oficiales."
    },
    profesional: {
        titulo: "PROFESIONAL",
        descripcion: "Competente, eficiente, orientado a resultados. Usa lenguaje de negocio, enfoque en soluciones y terminología del sector. Balance entre formalidad y claridad."
    }
};

// Abrir el modal y guardar el ID del módulo
window.abrirModalTono = function(moduloId) {
    moduloTonoActual = moduloId;
    contenidoGeneradoTono = null;
    
    const modal = document.getElementById("modalCambiarTono");
    
    // Obtener contenido original del módulo
    const contElement = document.getElementById(`contenido-${moduloId}`);
    if (contElement) {
        const contenidoOriginal = contElement.innerHTML.trim();
        
        // Mostrar contenido original (recortado)
        const contOriginalDiv = document.getElementById("contenidoOriginalTono");
        if (contOriginalDiv) {
            // Limitar a 200 caracteres para no saturar
            let textoRecortado = contenidoOriginal.replace(/<[^>]*>/g, ' ').trim();
            if (textoRecortado.length > 200) {
                textoRecortado = textoRecortado.substring(0, 200) + '...';
            }
            contOriginalDiv.textContent = textoRecortado || "(Contenido vacío)";
            
            // Contar palabras
            const palabras = textoRecortado.split(/\s+/).filter(word => word.length > 0).length;
            document.getElementById("palabrasOriginal").textContent = palabras;
        }
    }
    
    // Resetear estado del modal
    document.getElementById("selectTono").value = "";
    document.getElementById("contenidoGeneradoTono").innerHTML = 
        '<p class="text-gray-400 text-sm">Selecciona un tono y haz clic en "Generar Vista Previa"</p>';
    document.getElementById("btnAplicarTono").disabled = true;
    document.getElementById("btnAplicarTono").innerHTML = '<i class="fas fa-check mr-2"></i> Aplicar al módulo';
    document.getElementById("contadorPalabras").classList.add("hidden");
    
    // Ocultar descripción
    const descripcionDiv = document.getElementById("descripcionTono");
    if (descripcionDiv) {
        descripcionDiv.classList.add("hidden");
    }
    
    // Ocultar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    if (modalSpinner) {
        modalSpinner.classList.add("hidden");
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
};

// Función para mostrar descripción del tono seleccionado
function mostrarDescripcionTono() {
    const tono = document.getElementById("selectTono").value;
    const descripcionDiv = document.getElementById("descripcionTono");
    const textoDescripcion = document.getElementById("textoDescripcion");
    
    if (tono && descripcionesTono[tono]) {
        const info = descripcionesTono[tono];
        textoDescripcion.textContent = info.descripcion;
        descripcionDiv.classList.remove("hidden");
    } else {
        descripcionDiv.classList.add("hidden");
    }
}

// Cerrar el modal
window.cerrarModalTono = function() {
    const modal = document.getElementById("modalCambiarTono");
    if (!modal) return;
    
    // Resetear estados
    moduloTonoActual = null;
    contenidoGeneradoTono = null;
    
    // Ocultar descripción
    const descripcionDiv = document.getElementById("descripcionTono");
    if (descripcionDiv) {
        descripcionDiv.classList.add("hidden");
    }
    
    // Ocultar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    if (modalSpinner) {
        modalSpinner.classList.add("hidden");
    }
    
    // Re-habilitar botones
    const btnGenerar = document.getElementById("btnGenerarTono");
    const btnAplicar = document.getElementById("btnAplicarTono");
    if (btnGenerar) btnGenerar.disabled = false;
    if (btnAplicar) btnAplicar.disabled = true;
    
    // Ocultar modal
    modal.classList.add("hidden");
    modal.classList.remove("flex");
};

// Generar vista previa del contenido con nuevo tono
window.generarVistaPreviaTono = async function() {
    if (!moduloTonoActual) {
        alert("Error: No hay módulo seleccionado.");
        return;
    }

    const tono = document.getElementById("selectTono").value;
    if (!tono) {
        alert("Selecciona un tono primero.");
        return;
    }

    // Verificar que el tono existe en las descripciones
    if (!descripcionesTono[tono]) {
        alert(`Error: El tono "${tono}" no está configurado correctamente.`);
        return;
    }

    // Obtener contenido original del módulo
    const contElement = document.getElementById(`contenido-${moduloTonoActual}`);
    if (!contElement) {
        alert("No se encontró el contenido del módulo.");
        return;
    }

    const contenidoOriginal = contElement.innerHTML.trim();
    if (!contenidoOriginal || contenidoOriginal === "<p class='text-xs text-gray-400'>Sin contenido generado.</p>") {
        alert("El módulo no tiene contenido para reescribir.");
        return;
    }

    // Mostrar spinner
    const modalSpinner = document.getElementById("spinnerTono");
    const btnGenerar = document.getElementById("btnGenerarTono");
    const contenidoGeneradoDiv = document.getElementById("contenidoGeneradoTono");
    
    if (modalSpinner) {
        modalSpinner.classList.remove("hidden");
    }
    if (btnGenerar) {
        btnGenerar.disabled = true;
    }
    if (contenidoGeneradoDiv) {
        const infoTono = descripcionesTono[tono];
        contenidoGeneradoDiv.innerHTML = `
            <div class="flex items-center gap-2 text-blue-600 text-sm">
                <i class="fas fa-spinner fa-spin"></i>
                Generando contenido en tono <strong>${infoTono.titulo}</strong>...
            </div>
        `;
    }

    try {
        const endpoint = getGeminiEndpoint();

        const infoTono = descripcionesTono[tono];
        
        const prompt = `
# REESCRIBIR CONTENIDO CON TONO ESPECÍFICO

## TONO REQUERIDO: ${infoTono.titulo}

## CARACTERÍSTICAS DEL TONO:
${infoTono.descripcion}

## CONTENIDO ORIGINAL:
${contenidoOriginal}

## REGLAS ESTRICTAS:
1. MANTÉN EXACTAMENTE la misma estructura HTML original
2. NO cambies el significado ni el contenido informativo
3. NO agregues ni elimines secciones
4. NO uses nuevas etiquetas HTML
5. SOLO modifica el TONO del lenguaje según lo especificado
6. Conserva todas las tablas, listas, formato y elementos HTML
7. NO agregues explicaciones ni comentarios
8. NO uses backticks \`\`\` ni marcas de código

## EJEMPLOS DE TRANSFORMACIÓN:
Si el original dice: "Este es un tema importante"
- Académico: "Este constituye un tema de relevancia académica"
- Científico: "Los datos indican que este tema presenta significancia estadística"
- Periodístico: "Según expertos, este tema reviste importancia"
- Narrativo: "Este tema se desarrolló como una historia fascinante que..."
- Poético: "Este tema, cual joya preciada, brilla con importancia"
- Amigable: "Este es un tema muy importante que debemos entender"
- Infantil: "Este es un tema súper importante, ¡como un tesoro!"

Devuelve SOLO el contenido reescrito en HTML.
NO agregues comentarios, ni explicaciones, ni etiquetas adicionales.
`;

        const { response: res, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });

        if (!res.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${res.status}`));
        }

        const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text || contenidoOriginal;

        // Limpiar respuesta
        let nuevoContenido = textoRespuesta
            .replace(/```html/gi, "")
            .replace(/```/g, "")
            .replace(/^"|"$/g, '')
            .trim();

        // Guardar el contenido generado para posible aplicación
        contenidoGeneradoTono = nuevoContenido;

        // Mostrar en el modal
        if (contenidoGeneradoDiv) {
            contenidoGeneradoDiv.innerHTML = sanitizarHtmlEditorial(nuevoContenido);
            
            // Contar palabras del nuevo contenido
            const textoLimpio = nuevoContenido.replace(/<[^>]*>/g, ' ').trim();
            const palabrasNuevas = textoLimpio.split(/\s+/).filter(word => word.length > 0).length;
            
            // Mostrar contador
            const contadorDiv = document.getElementById("contadorPalabras");
            const palabrasNuevoSpan = document.getElementById("palabrasNuevo");
            if (contadorDiv && palabrasNuevoSpan) {
                palabrasNuevoSpan.textContent = palabrasNuevas;
                contadorDiv.classList.remove("hidden");
            }
        }

        // Habilitar botón de aplicar
        const btnAplicar = document.getElementById("btnAplicarTono");
        if (btnAplicar) {
            btnAplicar.disabled = false;
            btnAplicar.innerHTML = `<i class="fas fa-check mr-2"></i> Aplicar (${infoTono.titulo})`;
        }

    } catch (err) {
        
        if (contenidoGeneradoDiv) {
            contenidoGeneradoDiv.innerHTML = `
                <div class="text-red-600 text-sm">
                    <p>Error al generar el contenido:</p>
                    <p class="text-xs mt-2">${escapeHtml(err.message)}</p>
                    <button data-mc-action="generar-vista-previa-tono"
                            class="mt-3 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                        Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        // Ocultar spinner y re-habilitar botón generar
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }
        if (btnGenerar) {
            btnGenerar.disabled = false;
        }
    }
};

// Aplicar el contenido generado al módulo
window.aplicarCambioTono = async function() {
    if (!moduloTonoActual || !contenidoGeneradoTono) {
        alert("Error: No hay contenido generado para aplicar.");
        return;
    }

    const tono = document.getElementById("selectTono").value;
    if (!tono) {
        alert("Error: No se ha seleccionado un tono.");
        return;
    }

    // Obtener elemento del contenido original
    const contElement = document.getElementById(`contenido-${moduloTonoActual}`);
    if (!contElement) {
        alert("Error: No se encontró el módulo.");
        cerrarModalTono();
        return;
    }

    // Mostrar spinner de aplicación
    const modalSpinner = document.getElementById("spinnerTono");
    const btnAplicar = document.getElementById("btnAplicarTono");
    
    if (modalSpinner) {
        modalSpinner.classList.remove("hidden");
        modalSpinner.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Aplicando contenido al módulo...`;
    }
    if (btnAplicar) {
        btnAplicar.disabled = true;
    }

    try {
        // Actualizar en la página
        contElement.innerHTML = sanitizarHtmlEditorial(contenidoGeneradoTono);

        // Guardar en Firebase
        await guardarModulo(moduloTonoActual, { contenido: contenidoGeneradoTono });

        // Ocultar spinner
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }

        // Cerrar modal
        cerrarModalTono();

        // Mostrar mensaje de éxito en el módulo
        setTimeout(() => {
            const modSpinner = document.getElementById(`spinner-${moduloTonoActual}`);
            if (modSpinner) {
                modSpinner.classList.remove("hidden");
                const infoTono = descripcionesTono[tono] || { titulo: tono };
                modSpinner.innerHTML = `<span class="text-green-600 text-xs">✓ Tono cambiado a ${infoTono.titulo}</span>`;
                setTimeout(() => modSpinner.classList.add("hidden"), 3000);
            }
        }, 100);

        // Reactivar acciones en párrafos
        setTimeout(() => {
            if (typeof activarAccionesEnParrafos === 'function') {
                activarAccionesEnParrafos();
            }
        }, 200);

        // Mostrar alerta de éxito
        const infoTono = descripcionesTono[tono] || { titulo: tono };
        alert(`✓ Contenido actualizado con tono ${infoTono.titulo}`);

    } catch (err) {
        
        if (modalSpinner) {
            modalSpinner.classList.add("hidden");
        }
        if (btnAplicar) {
            btnAplicar.disabled = false;
        }
        
        alert(`Error al guardar el contenido: ${err.message}`);
    }
};

// Agrega esto en el DOMContentLoaded o al final de moodleCourse.js
document.addEventListener('DOMContentLoaded', function() {
    // Conectar botón Cancelar
    const btnCancelarTono = document.getElementById("btnCancelarTono");
    if (btnCancelarTono) {
        btnCancelarTono.onclick = function() {
            window.cerrarModalTono();
        };
    }
    
    // Conectar botón Generar Vista Previa
    const btnGenerarTono = document.getElementById("btnGenerarTono");
    if (btnGenerarTono) {
        btnGenerarTono.onclick = function() {
            window.generarVistaPreviaTono();
        };
    }
    
    // Conectar botón Aplicar
    const btnAplicarTono = document.getElementById("btnAplicarTono");
    if (btnAplicarTono) {
        btnAplicarTono.onclick = function() {
            window.aplicarCambioTono();
        };
    }
    
    // Mostrar descripción cuando se selecciona un tono
    const selectTono = document.getElementById("selectTono");
    if (selectTono) {
        selectTono.addEventListener('change', mostrarDescripcionTono);
        
        // También permitir Enter para generar
        selectTono.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                window.generarVistaPreviaTono();
            }
        });
    }
});




// ===============================
// CREAR TABLA A PARTIR DEL MÓDULO
// ===============================

let moduloCrearTablaId = null;
let htmlOriginalModuloTabla = "";

// Abrir modal y cargar contenido actual del módulo
window.abrirModalCrearTabla = function (moduloId) {
    moduloCrearTablaId = moduloId;

    const cont = document.getElementById(`contenido-${moduloId}`);
    htmlOriginalModuloTabla = cont ? cont.innerHTML : "";

    const previewOrigen = document.getElementById("tablaPreviewOrigen");
    if (previewOrigen) {
        previewOrigen.innerHTML = htmlOriginalModuloTabla || 
            "<p class='text-xs text-gray-400'>Sin contenido para organizar.</p>";
    }

    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (previewTabla) previewTabla.innerHTML = "";

    document.getElementById("modalCrearTablaModulo").classList.remove("hidden");
};

window.cerrarModalCrearTabla = function () {
    document.getElementById("modalCrearTablaModulo").classList.add("hidden");
    moduloCrearTablaId = null;
    htmlOriginalModuloTabla = "";
};




// Botón "Generar vista previa"
// ===========================================
// PREVISUALIZACIÓN INTELIGENTE CON GEMINI
// ===========================================

window.previsualizarTablaModulo = async function () {
    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) return;

    previewTabla.innerHTML = `
        <div class="text-blue-600 text-xs flex items-center gap-2">
            <i class="fas fa-spinner fa-spin"></i> Analizando contenido con IA...
        </div>
    `;

    const endpoint = getGeminiEndpoint();

    const prompt = `
Convierte TODO el siguiente contenido en UNA SOLA TABLA HTML organizada.

REGLAS IMPORTANTES:
- No agregues texto fuera de la tabla.
- No expliques nada.
- No agregues comentarios.
- No uses markdown.
- No uses \`\`\`.
- No inventes contenido.
- Agrupa información por categorías detectadas.
- Decide cuántas columnas necesita la tabla.
- Si detectas "Etiqueta: valor", usa una columna para etiqueta y otra para el contenido.
- Si detectas listas, conviértelas en filas.
- Si detectas secciones o títulos, conviértelos en <th>.
- Devuelve SOLO <table>...</table>.

=== CONTENIDO ORIGINAL ===
${htmlOriginalModuloTabla}
    `;

    try {
        const { response, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });
        if (!response.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${response.status}`));
        }

        let tablaHTML = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // ❗ SIN limpiar nada. SIN alterar lo que Gemini devuelve.
        previewTabla.innerHTML = sanitizarHtmlEditorial(tablaHTML);

    } catch (error) {
        previewTabla.innerHTML = `
            <p class="text-red-500 text-xs">Error generando tabla con IA.</p>
        `;
    }
};

// Botón "Aplicar al módulo" → reemplaza contenido y guarda en Firestore
window.aplicarTablaModulo = async function () {
    if (!moduloCrearTablaId) {
        alert("No hay módulo seleccionado.");
        return;
    }

    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) {
        alert("No se encontró la vista previa generada.");
        return;
    }

    // ❗ ESTA ES LA TABLA EXACTA QUE GENERÓ GEMINI
    const tablaHTML = previewTabla.innerHTML.trim();

    if (!tablaHTML || tablaHTML.length < 10) {
        alert("La tabla generada está vacía o no es válida.");
        return;
    }

    // Reemplazar contenido en pantalla
    const cont = document.getElementById(`contenido-${moduloCrearTablaId}`);
    if (cont) cont.innerHTML = sanitizarHtmlEditorial(tablaHTML);

    try {
        // Guardar EXACTAMENTE lo que devolvió Gemini
        await guardarModulo(moduloCrearTablaId, { contenido: tablaHTML });

    } catch (err) {
        alert("La tabla se aplicó en pantalla, pero hubo error al guardar en Firebase.");
    }

    cerrarModalCrearTabla();
};

window.copiarTablaPreview = async function () {
    const previewTabla = document.getElementById("tablaPreviewResultado");
    if (!previewTabla) return;

    const table = previewTabla.querySelector("table");
    const html = table ? table.outerHTML : previewTabla.innerHTML;

    if (!html || !html.trim()) {
        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("No hay tabla para copiar.", "info");
        } else {
            alert("No hay tabla para copiar.");
        }
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(html);
        } else {
            const temp = document.createElement("textarea");
            temp.value = html;
            temp.setAttribute("readonly", "");
            temp.style.position = "absolute";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
        }

        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("Tabla copiada al portapapeles.", "success");
        } else {
            alert("Tabla copiada al portapapeles.");
        }
    } catch (err) {
        if (typeof mostrarNotificacion === "function") {
            mostrarNotificacion("No se pudo copiar la tabla.", "error");
        } else {
            alert("No se pudo copiar la tabla.");
        }
    }
};





window.activarAccionesEnParrafos = function () {
    // 🔥 CORRECCIÓN: Eliminar completamente los menús contextuales al pasar el mouse
    // Solo dejaremos el menú de formato que aparece al seleccionar texto
    
    // Limpiar cualquier menú contextual existente
    document.querySelectorAll('.parrafo-actions').forEach(el => {
        el.remove();
    });
    
    // También eliminar estilos añadidos anteriormente
    const elementos = document.querySelectorAll(`
        #resultadoGenerado p, #resultadoGenerado li, #resultadoGenerado td, #resultadoGenerado th,
        #resultadoGenerado h1, #resultadoGenerado h2, #resultadoGenerado h3, #resultadoGenerado h4,
        .modulo-contenido p, .modulo-contenido li, .modulo-contenido td, .modulo-contenido th,
        .modulo-contenido h1, .modulo-contenido h2, .modulo-contenido h3, .modulo-contenido h4,
        #contenidoTraduccionModulo p, #contenidoTraduccionModulo li, #contenidoTraduccionModulo td,
        #contenidoTraduccionModulo th, #contenidoTraduccionModulo h1, #contenidoTraduccionModulo h2,
        #contenidoTraduccionModulo h3, #contenidoTraduccionModulo h4,
        #contenidoTraduccionSubtema p, #contenidoTraduccionSubtema li, #contenidoTraduccionSubtema td,
        #contenidoTraduccionSubtema th, #contenidoTraduccionSubtema h1, #contenidoTraduccionSubtema h2,
        #contenidoTraduccionSubtema h3, #contenidoTraduccionSubtema h4
    `);
    
    // Quitar estilos específicos añadidos anteriormente
    elementos.forEach(el => {
        el.style.position = "";
        el.style.display = "";
        el.style.paddingRight = "";
        el.classList.remove('parrafo-editando');
    });
    
};


async function guardarContenidoDeTodosLosModulos() {
    if (!subtemaActivo || !subtemaActivo.modulosIds) return;

    const modContenedores = document.querySelectorAll(".modulo-contenido");

    for (let div of modContenedores) {
        const moduloId = div.closest("[id^='modulo-']")?.id.replace("modulo-", "");
        if (!moduloId) continue;

        await guardarModulo(moduloId, {
            contenido: normalizarContenidoModuloPersistible(div.innerHTML)
        });
    }

    // guardar contenido generado del subtema
    const gen = document.getElementById("resultadoGenerado");
    if (gen) {
        subtemaActivo.contenidoGenerado = sanitizarHtmlEditorial(gen.innerHTML);
    }

    await guardarCursoFirebase();
}


function activarEdicionInlineParrafo(p) {
    // Evitar reactivar si ya está editable
    if (p.isContentEditable) return;

    // Estilos visuales de edición
    p.contentEditable = "true";
    p.classList.add("parrafo-editando");
    p.style.border = "1px dashed #4AA3FF";
    p.style.padding = "6px";
    p.style.background = "#f0f9ff";

    p.focus();

    // Al salir del párrafo → guardar
    p.addEventListener("blur", () => {
        p.contentEditable = "false";
        p.classList.remove("parrafo-editando");
        p.style.border = "";
        p.style.background = "";
        p.style.padding = "";

        // Guardar el contenido actualizado en Firebase
        guardarContenidoGenerado();

        // Reactivar los iconos
        activarAccionesEnParrafos();
    }, { once: true });
}


function guardarContenidoGenerado() {
    const cont = document.getElementById("resultadoGenerado");
    if (!cont) return;

    subtemaActivo.contenidoGenerado = sanitizarHtmlEditorial(cont.innerHTML);
    guardarCursoFirebase();
}




async function mostrarSpinnerReformular(elemento) {
    // Si ya existe un spinner, no lo dupliques
    if (elemento.querySelector(".ai-reformulando")) return;

    const spinner = document.createElement("div");
    spinner.className = "ai-reformulando";
    spinner.innerHTML = `
        <div class="cb-reform-spinner-badge">
            <i class="fas fa-spinner fa-spin"></i>
            Reformulando...
        </div>
    `;
    elemento.classList.add("cb-relative");
    elemento.appendChild(spinner);

    return spinner;
}






/* ============================================================
      MENU DE FORMATO PARA TEXTO SELECCIONADO
============================================================ */

let formatMenu = null;
let currentSelection = null;


// Inicializar menú cuando cargue la página
document.addEventListener("DOMContentLoaded", () => {
    formatMenu = document.getElementById("textFormatMenu");
    activarMenuFormatoSeleccion();
    
    // 🔥 AÑADE ESTO para inicializar el modal de reformular
    inicializarModalReformular();
});


function inicializarModalReformular() {
    const radios = document.querySelectorAll('input[name="tipoReformulacion"]');
    const inputPersonalizadoContainer = document.getElementById("inputPersonalizadoContainer");
    
    if (!radios.length) {
        return;
    }
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === "personalizado") {
                if (inputPersonalizadoContainer) {
                    inputPersonalizadoContainer.classList.remove("hidden");
                    document.getElementById("instruccionesPersonalizadas")?.focus();
                }
            } else {
                if (inputPersonalizadoContainer) {
                    inputPersonalizadoContainer.classList.add("hidden");
                }
            }
        });
    });
    
    // Botón Cancelar
    const btnCancelar = document.getElementById("btnCancelarReformular");
    const btnConfirmar = document.getElementById("btnConfirmarReformular");
    
}


function activarMenuFormatoSeleccion() {
    document.addEventListener("mouseup", manejarSeleccionTexto);
    document.addEventListener("keyup", manejarSeleccionTexto);

    // Cerrar al hacer clic afuera
    document.addEventListener("click", (e) => {
        if (!formatMenu.contains(e.target)) {
            formatMenu.classList.add("hidden");
        }
    });

    // Acciones del menú
    formatMenu.addEventListener("click", (e) => {
        
        const action = e.target.closest("button")?.dataset?.action;
        
        if (!action) return;
        
        // Llamar a la función correcta
        ejecutarAccionFormato(action);
        
        formatMenu.classList.add("hidden");
    });

}

function manejarSeleccionTexto(e) {
    setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim() === "") {
            formatMenu.classList.add("hidden");
            return;
        }

        if (!sel.rangeCount) return;

        currentSelection = sel.getRangeAt(0);
        
        // 🔥 CORRECCIÓN: Solo mostrar menú si la selección está dentro de .modulo-contenido
        const commonAncestor = currentSelection.commonAncestorContainer;
        const isInsideModuloContenido = commonAncestor.closest?.('.modulo-contenido');
        const isInsideGenerado = commonAncestor.closest?.('#resultadoGenerado');
        const isInsideTraduccion = commonAncestor.closest?.('#contenidoTraduccionModulo, #contenidoTraduccionSubtema');
        
        // Si no está en ninguna de estas áreas permitidas, no mostrar menú
        if (!isInsideModuloContenido && !isInsideGenerado && !isInsideTraduccion) {
            formatMenu.classList.add("hidden");
            return;
        }

        // NO mostrar si selecciona dentro del menú
        if (formatMenu.contains(sel.anchorNode)) return;

        // Posicionar el menú
        const rect = currentSelection.getBoundingClientRect();
        formatMenu.style.top = `${rect.top + window.scrollY - 40}px`;
        formatMenu.style.left = `${rect.left + window.scrollX}px`;
        formatMenu.classList.remove("hidden");
    }, 50);
}


function ejecutarAccionFormato(action) {
    if (!currentSelection) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    switch (action) {
        case "bold":
        case "italic":
        case "clear":
            // Usar las funciones existentes para formato
            ejecutarAccionFormatoBase(action);
            break;
            
        case "reformular":
            // 🔥 CORRECCIÓN: Abrir modal en lugar de reformular automáticamente
            mostrarModalReformular();
            break;
            
        case "delete":
            eliminarSeleccion();
            break;
    }
}


function ejecutarAccionFormatoBase(action) {
    const range = currentSelection.cloneRange();
    const container = range.commonAncestorContainer;
    
    if (container.nodeType === Node.TEXT_NODE) {
        const parent = container.parentElement;
        
        // Si ya tiene el formato y queremos aplicar el mismo, quitar formato
        if (action === "bold" && (parent.tagName === 'STRONG' || parent.tagName === 'B')) {
            limpiarFormatoSeleccionado();
            return;
        }
        
        if (action === "italic" && (parent.tagName === 'EM' || parent.tagName === 'I')) {
            limpiarFormatoSeleccionado();
            return;
        }
    }

    let wrapper;

    switch (action) {
        case "bold":
            wrapper = document.createElement("strong");
            break;

        case "italic":
            wrapper = document.createElement("em");
            break;

        case "clear":
            limpiarFormatoSeleccionado();
            return;
    }

    try {
        if (range.toString().trim() === "" || range.collapsed) {
            return;
        }
        
        range.surroundContents(wrapper);
        guardarContenidoEditado();
    } catch (e) {
        const text = range.toString();
        if (text.trim()) {
            wrapper.textContent = text;
            range.deleteContents();
            range.insertNode(wrapper);
            guardarContenidoEditado();
        }
    }
}


function mostrarModalReformular() {
    
    const modal = document.getElementById("modalReformular");
    
    // Verificar si hay estilos que lo ocultan

    
    if (!currentSelection) {
        return;
    }
    
    textoOriginalParaReformular = currentSelection.toString().trim();
    seleccionOriginalParaReformular = currentSelection;
    
    
    if (!textoOriginalParaReformular) {
        alert("No hay texto seleccionado para reformular.");
        return;
    }
    
    if (!modal) {
        alert("Error: No se puede abrir el modal de reformulación");
        return;
    }
    
    const preview = document.getElementById("textoSeleccionadoPreview");
    if (!preview) {
    } else {
        // Mostrar texto seleccionado (recortado si es muy largo)
        let textoPreview = textoOriginalParaReformular;
        if (textoPreview.length > 200) {
            textoPreview = textoPreview.substring(0, 200) + "...";
        }
        preview.textContent = textoPreview;
    }
    
    // Resetear valores
    const radioMejorar = document.querySelector('input[name="tipoReformulacion"][value="mejorar"]');
    if (radioMejorar) {
        radioMejorar.checked = true;
    }
    
    const inputContainer = document.getElementById("inputPersonalizadoContainer");
    if (inputContainer) {
        inputContainer.classList.add("hidden");
    }
    
    const instruccionesInput = document.getElementById("instruccionesPersonalizadas");
    if (instruccionesInput) {
        instruccionesInput.value = "";
    }
    
    // Mostrar modal
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    
    // Enfocar en el modal
    setTimeout(() => {
        document.getElementById("instruccionesPersonalizadas")?.focus();
    }, 100);
}

// Manejar cambio en tipo de reformulación
document.addEventListener('DOMContentLoaded', function() {
    const radios = document.querySelectorAll('input[name="tipoReformulacion"]');
    const inputPersonalizadoContainer = document.getElementById("inputPersonalizadoContainer");
    
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === "personalizado") {
                inputPersonalizadoContainer.classList.remove("hidden");
                document.getElementById("instruccionesPersonalizadas").focus();
            } else {
                inputPersonalizadoContainer.classList.add("hidden");
            }
        });
    });
    
    // Botón Cancelar
    document.getElementById("btnCancelarReformular").addEventListener("click", function() {
        document.getElementById("modalReformular").classList.add("hidden");
    });
    
    // Botón Confirmar
    document.getElementById("btnConfirmarReformular").addEventListener("click", ejecutarReformulacionConInstrucciones);
});

// Función principal para reformular con instrucciones
async function ejecutarReformulacionConInstrucciones() {
    const modal = document.getElementById("modalReformular");
    const btnConfirmar = document.getElementById("btnConfirmarReformular");
    
    if (!seleccionOriginalParaReformular || !textoOriginalParaReformular) {
        alert("Error: No hay texto seleccionado.");
        return;
    }
    
    // Obtener tipo de reformulación seleccionado
    const tipoSeleccionado = document.querySelector('input[name="tipoReformulacion"]:checked').value;
    const idiomaDetectado = detectarIdiomaParaNotas(textoOriginalParaReformular || "");
    
    // Construir prompt según el tipo
    let instruccionesIA = "";
    
    switch (tipoSeleccionado) {
        case "mejorar":
            instruccionesIA = construirInstruccionReformulacion("mejorar", idiomaDetectado);
            break;
        case "simplificar":
            instruccionesIA = construirInstruccionReformulacion("simplificar", idiomaDetectado);
            break;
        case "formal":
            instruccionesIA = construirInstruccionReformulacion("formal", idiomaDetectado);
            break;
        case "coloquial":
            instruccionesIA = construirInstruccionReformulacion("coloquial", idiomaDetectado);
            break;
        case "extender":
            instruccionesIA = construirInstruccionReformulacion("extender", idiomaDetectado);
            break;
        case "resumir":
            instruccionesIA = construirInstruccionReformulacion("resumir", idiomaDetectado);
            break;
        case "personalizado":
            const instruccionesPersonal = document.getElementById("instruccionesPersonalizadas").value.trim();
            if (!instruccionesPersonal) {
                alert("Por favor, escribe instrucciones personalizadas.");
                document.getElementById("instruccionesPersonalizadas").focus();
                return;
            }
            instruccionesIA = construirInstruccionReformulacion("personalizado", idiomaDetectado, instruccionesPersonal);
            break;
    }
    
    // Mostrar loading
    const originalBtnText = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Reformulando...';
    
    try {
        // Llamar a la función de IA
        const textoReformulado = await reformularTextoConIA(textoOriginalParaReformular, instruccionesIA, idiomaDetectado);
        
        // Reemplazar el texto en el documento
        seleccionOriginalParaReformular.deleteContents();
        const nuevoNodo = document.createTextNode(textoReformulado);
        seleccionOriginalParaReformular.insertNode(nuevoNodo);
        
        // Guardar cambios
        guardarContenidoEditado();
        
        // Cerrar modal
        modal.classList.add("hidden");
        
        // Mostrar notificación
        mostrarNotificacion("✅ Texto reformulado exitosamente", 'success');
        
    } catch (error) {
        mostrarNotificacion("❌ Error al reformular el texto", 'error');
    } finally {
        // Restaurar botón
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = originalBtnText;
    }
}

function construirInstruccionReformulacion(tipo, idiomaDetectado, personalizado = "") {
    const lang = idiomaDetectado?.code || "es";

    const instruccionesPorIdioma = {
        es: {
            mejorar: "Mejora la redacción de este texto manteniendo el mismo significado. Hazlo más claro, coherente y profesional.",
            simplificar: "Simplifica este texto para que sea más fácil de entender. Usa lenguaje más sencillo y directo.",
            formal: "Convierte este texto a un tono formal y académico. Usa lenguaje profesional y estructuras complejas.",
            coloquial: "Convierte este texto a un tono coloquial y conversacional, natural y cercano.",
            extender: "Extiende este texto. Añade detalles útiles y ejemplos sin cambiar el significado original.",
            resumir: "Resume este texto de forma concisa, conservando las ideas principales.",
            personalizado: `${personalizado}`
        },
        en: {
            mejorar: "Improve the writing while keeping the same meaning. Make it clearer, coherent, and professional.",
            simplificar: "Simplify this text so it is easier to understand. Use plain and direct language.",
            formal: "Rewrite this text in a formal academic tone using professional wording.",
            coloquial: "Rewrite this text in a conversational and natural tone.",
            extender: "Expand this text by adding useful details and examples without changing the original meaning.",
            resumir: "Summarize this text concisely while preserving the main ideas.",
            personalizado: `${personalizado}`
        },
        pt: {
            mejorar: "Melhore a redação deste texto mantendo o mesmo significado. Torne-o mais claro, coerente e profissional.",
            simplificar: "Simplifique este texto para que seja mais fácil de entender. Use linguagem simples e direta.",
            formal: "Reescreva este texto em tom formal e acadêmico.",
            coloquial: "Reescreva este texto em tom coloquial e conversacional.",
            extender: "Expanda este texto com detalhes úteis sem alterar o significado original.",
            resumir: "Resuma este texto de forma concisa mantendo as ideias principais.",
            personalizado: `${personalizado}`
        },
        fr: {
            mejorar: "Améliore la rédaction de ce texte en conservant le même sens. Rends-le plus clair, cohérent et professionnel.",
            simplificar: "Simplifie ce texte pour qu'il soit plus facile à comprendre. Utilise un langage simple et direct.",
            formal: "Réécris ce texte dans un ton formel et académique.",
            coloquial: "Réécris ce texte dans un ton conversationnel et naturel.",
            extender: "Développe ce texte avec des détails utiles sans changer le sens original.",
            resumir: "Résume ce texte de manière concise en gardant les idées principales.",
            personalizado: `${personalizado}`
        }
    };

    const pack = instruccionesPorIdioma[lang] || instruccionesPorIdioma.es;
    const instruccion = pack[tipo] || pack.mejorar;
    return `${instruccion}`.trim();
}

// Nueva función para reformular texto con instrucciones específicas
async function reformularTextoConIA(textoOriginal, instrucciones, idiomaDetectado = { code: "es", label: "español" }) {
    try {
        const endpoint = getGeminiEndpoint();
        const idiomaLabel = idiomaDetectado?.label || "español";
        const idiomaCode = idiomaDetectado?.code || "es";
        
        const prompt = `
${instrucciones}

IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado del texto original: ${idiomaLabel} (${idiomaCode}).
- Devuelve la reformulación COMPLETAMENTE en ${idiomaLabel}.
- No cambies de idioma.

TEXTO ORIGINAL:
${textoOriginal}

REGLAS IMPORTANTES:
- NO cambies el significado fundamental
- NO agregues información que no esté implícita
- NO uses marcas como \`\`\` o comillas
- Devuelve SOLO el texto reformulado
- Mantén la misma longitud aproximada (a menos que sea extender o resumir)
        `;
        
        const { response, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        if (!response.ok) {
            throw new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${response.status}`));
        }
        
        let textoReformulado = data?.candidates?.[0]?.content?.parts?.[0]?.text || textoOriginal;
        
        // Limpiar respuesta
        textoReformulado = textoReformulado
            .replace(/```/g, "")
            .replace(/^"|"$/g, '')
            .trim();
        
        return textoReformulado;
        
    } catch (error) {
        throw error;
    }
}


async function reformularSeleccionConIA() {
    const textoSeleccionado = currentSelection.toString().trim();
    if (!textoSeleccionado) return;

    try {
        // Mostrar spinner en el menú
        const menu = document.getElementById("textFormatMenu");
        const originalHTML = menu.innerHTML;
        menu.innerHTML = '<div class="px-3 py-1 text-sm"><i class="fas fa-spinner fa-spin"></i> Reformulando...</div>';

        // Usar la función de reformular que ya tienes
        if (typeof reformularParrafoConIA === 'function') {
            const textoReformulado = await reformularParrafoConIA(textoSeleccionado);
            
            // Reemplazar la selección
            currentSelection.deleteContents();
            const nuevoNodo = document.createTextNode(textoReformulado);
            currentSelection.insertNode(nuevoNodo);
            
            guardarContenidoEditado();
            
            // Restaurar menú
            menu.innerHTML = originalHTML;
        }
    } catch (error) {
        alert("Error al reformular con IA");
    }
}

function eliminarSeleccion() {
    if (!confirm("¿Eliminar el texto seleccionado?")) return;
    
    try {
        currentSelection.deleteContents();
        guardarContenidoEditado();
    } catch (error) {
    }
}

function envolverSeleccion(wrapper) {
    const range = currentSelection.cloneRange();
    range.surroundContents(wrapper);
}

function limpiarFormatoSeleccionado() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    
    // Obtener el elemento contenedor más cercano
    let container = range.commonAncestorContainer;
    
    // Si el contenedor es un nodo de texto, subir al elemento padre
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }
    
    // Verificar si el contenedor ya tiene formato (strong o em)
    const isBold = container.tagName === 'STRONG' || container.tagName === 'B';
    const isItalic = container.tagName === 'EM' || container.tagName === 'I';
    
    if (isBold || isItalic) {
        // Reemplazar el elemento formateado por su contenido
        const fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }
        container.parentNode.replaceChild(fragment, container);
        
        // Restaurar la selección
        const newRange = document.createRange();
        newRange.setStart(fragment, 0);
        newRange.setEnd(fragment, fragment.childNodes.length);
        sel.removeAllRanges();
        sel.addRange(newRange);
    } else {
        // Método original para contenido seleccionado dentro de párrafos
        const content = range.extractContents();
        content.querySelectorAll("strong, em, b, i").forEach(el => {
            el.replaceWith(...el.childNodes);
        });
        range.insertNode(content);
    }
}



function guardarContenidoEditado() {

    /* ================================
       1) SUBTEMA — resultadoGenerado
    ================================ */
    const contSubtema = document.getElementById("resultadoGenerado");
    if (contSubtema && contSubtema.contains(currentSelection.startContainer)) {

        if (!window.subtemaActivo) return;
        window.subtemaActivo.contenidoGenerado = sanitizarHtmlEditorial(contSubtema.innerHTML);

        guardarCursoFirebase();
        return;
    }

    /* ================================
       2) MÓDULO ACTIVO
    ================================ */
    const contModulo = document.querySelector(".modulo-activo .modulo-contenido");

    if (contModulo && contModulo.contains(currentSelection.startContainer)) {

        const modId = localStorage.getItem("moduloActivo");
        if (modId) {
            guardarModulo(modId, { contenido: normalizarContenidoModuloPersistible(contModulo.innerHTML) });
        }

        return;
    }

    /* ================================
       3) TRADUCCIÓN DE SUBTEMA
    ================================ */
    const contTrad = document.getElementById("contenidoTraduccionSubtema");
    if (contTrad && contTrad.contains(currentSelection.startContainer)) {

        const sub = window.subtemaActivo;
        if (!sub) return;

        const idTrad = contTrad.dataset.traduccionId;
        const trad = sub.traducciones.find(t => t.id === idTrad);

        if (trad) {
            trad.contenido = contTrad.innerHTML;
            guardarCursoFirebase();
        }

        return;
    }

    /* ================================
       4) TRADUCCIÓN DE MÓDULO
    ================================ */
    const contModTrad = document.getElementById("contenidoTraduccionModulo");
    if (contModTrad && contModTrad.contains(currentSelection.startContainer)) {

        const sub = window.subtemaActivo;
        if (!sub) return;

        const modId = localStorage.getItem("moduloActivo");
        if (modId) {
            const contModulo = document.querySelector(`#modulo-${modId} .modulo-contenido`);

            if (contModulo && contModulo.contains(currentSelection.startContainer)) {
                guardarModulo(modId, { contenido: normalizarContenidoModuloPersistible(contModulo.innerHTML) });
                return;
            }
        }
    }   

}



/* ============================================
   MENÚ CONTEXTUAL PARA TEMAS / SUBTEMAS / MÓDULOS
============================================ */
let contextTarget = null; // referencia al item seleccionado





function activarEdicionInlineModulo(liMod, modulo) {
    const spanNombre = liMod.querySelector(".modulo-nombre");

    // Crear input
    const input = document.createElement("input");
    input.type = "text";
    input.value = modulo.nombre;
    input.className = "w-full text-xs p-1 border rounded bg-white";

    // Reemplazar el span por el input
    spanNombre.replaceWith(input);
    input.focus();

    // Guardar al presionar Enter
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            modulo.nombre = input.value.trim() || modulo.nombre;
            await guardarCursoFirebase();
            renderTemas();
        }
    });

    // Guardar al perder foco
    input.addEventListener("blur", async () => {
        modulo.nombre = input.value.trim() || modulo.nombre;
        await guardarCursoFirebase();
        renderTemas();
    });
}




function activarEdicionInlineGeneral(span, objeto) {
    if (!span) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = objeto.nombre;
    input.className = "w-full text-xs p-1 border rounded bg-white";

    span.replaceWith(input);
    input.focus();

    function guardar() {
        objeto.nombre = input.value.trim() || objeto.nombre;
        guardarCursoFirebase();
        renderTemas();
    }

    input.addEventListener("keydown", e => e.key === "Enter" && guardar());
    input.addEventListener("blur", guardar);
}




/* BOTÓN: GUARDAR MANUAL EN FIREBASE */
const btnGuardarFirebase = document.getElementById("btnGuardarFirebase");
if (btnGuardarFirebase) {
    btnGuardarFirebase.addEventListener("click", async () => {
        if (!cursoDocId) return;
        
        // Verificar si el usuario actual tiene permisos para editar
        const cursoActual = cursosUsuario.find(c => c.id === cursoDocId);
        
        if (!cursoActual) {
            alert("Curso no encontrado");
            return;
        }
        
        if (!cursoActual.esPropio && !cursoActual.permisos.editar) {
            alert("No tienes permisos para guardar cambios en este curso");
            return;
        }
        
        await guardarCursoFirebase();
        
        // Feedback visual
        const icon = btnGuardarFirebase.querySelector("i");
        if (!icon) return;
        icon.classList.remove('fa-cloud-arrow-up');
        icon.classList.add('fa-check');
        setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-cloud-arrow-up');
        }, 2000);
    });
}



/* BOTÓN: DESCARGAR WORD */
/* BOTÓN: DESCARGAR WORD */
function convertirInstruccionesOriginalesAHtmlWord(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.includes("<") && raw.includes(">")) {
        return sanitizarHtmlEditorial(sanitizeRichText(raw));
    }
    return `<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p>`;
}

function construirContenidoHtmlWord(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return "<p>(Sin contenido)</p>";
    if (typeof renderizarContenidoModulo === "function") {
        return renderizarContenidoModulo(raw);
    }
    if (raw.includes("<") && raw.includes(">")) {
        return sanitizarHtmlEditorial(sanitizeRichText(raw));
    }
    return `<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p>`;
}

function construirContenidoModuloWord(modulo = {}) {
    const contenidoLimpio = construirContenidoHtmlWord(modulo.contenido || "<p>(Sin contenido)</p>")
        .replace(/<div[^>]*class="[^"]*rounded-lg[^"]*bg-background[^"]*shadow-sm[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
        .replace(/<div[^>]*class="[^"]*rounded-lg[^"]*bg-muted\/40[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
        .replace(/<div[^>]*class="[^"]*text-xs[^"]*text-gray-500[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
        .replace(/<p[^>]*>\s*M[oó]dulo analizado:[\s\S]*?<\/p>/gi, "")
        .replace(/<label[^>]*class="[^"]*section-title[^"]*"[^>]*>[\s\S]*?<\/label>/gi, "")
        .replace(/<h1[^>]*class="[^"]*font-semibold[^"]*text-slate-900[^"]*mt-3[^"]*mb-2[^"]*"[^>]*>([\s\S]*?)<\/h1>/gi, '<h2 class="word-titulo2">$1</h2>');

    const instruccionOriginal = modulo.incluirInstruccionOriginalEnPropuesta === true && String(modulo.instrucciones || "").trim()
        ? `
            <div class="word-instruccion-original">
                <h4>Instrucción original</h4>
                ${convertirInstruccionesOriginalesAHtmlWord(modulo.instrucciones || "")}
            </div>
        `
        : "";

    return `
        <div class="modulo">
            <h3 class="modulo-nombre-word">${escapeHtml(modulo.nombre || "Módulo sin nombre")}</h3>
            ${instruccionOriginal}
            <div class="word-propuesta-generada">
                ${contenidoLimpio || "<p>(Sin contenido)</p>"}
            </div>
        </div>
    `;
}

function construirActividadOriginalHtmlModulo(modulo = {}) {
    const instruccionesRaw = String(modulo?.instrucciones || "").trim();
    if (!instruccionesRaw) return "";
    const hydrated = hidratarHtmlInstruccionesGemini(instruccionesRaw, String(modulo?.id || "").trim());
    const bodyHtml = instruccionesRaw.includes("<") && instruccionesRaw.includes(">")
        ? sanitizarHtmlEditorial(hydrated)
        : `<p>${escapeHtml(hydrated).replace(/\n/g, "<br>")}</p>`;
    return `
        <div class="word-instruccion-original">
            <h4>Actividad original</h4>
            <div>${bodyHtml}</div>
        </div>
    `.trim();
}

function contenidoModuloYaIncluyeActividadOriginal(html = "") {
    const raw = String(html || "").trim();
    if (!raw) return false;
    const root = document.createElement("div");
    root.innerHTML = raw;
    if (root.querySelector(".cb-module-block-title.is-original, .word-instruccion-original")) return true;
    return Array.from(root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote"))
        .some((node) => String(node.textContent || "").trim().toLowerCase() === "actividad original");
}

function quitarActividadOriginalDelContenido(html = "") {
    const raw = String(html || "").trim();
    if (!raw) return "";
    const root = document.createElement("div");
    root.innerHTML = raw;

    const headings = Array.from(root.querySelectorAll(".cb-module-block-title.is-original, h1, h2, h3, h4, p, li, blockquote"));
    headings.forEach((heading) => {
        const text = String(heading.textContent || "").trim();
        const esBloqueOriginal =
            heading.classList?.contains("is-original") ||
            /^actividad(?:\s+\d+)?\s+original\b/i.test(text);
        if (!esBloqueOriginal) return;

        let cursor = heading.nextElementSibling;
        const nodesToRemove = [heading];
        while (cursor) {
            const next = cursor.nextElementSibling;
            const textCursor = String(cursor.textContent || "").trim();
            const esSiguienteSeparador =
                cursor.classList?.contains("cb-module-block-title") ||
                /^actividad(?:\s+\d+)?\s+original\b/i.test(textCursor) ||
                /^propuesta(?:\s+actividad(?:\s+\d+)?)?\b/i.test(textCursor);
            if (esSiguienteSeparador) break;
            nodesToRemove.push(cursor);
            cursor = next;
        }
        nodesToRemove.forEach((node) => node.remove());
    });

    return root.innerHTML.trim();
}

function aplicarVisibilidadActividadOriginalEnContenido(html = "", modulo = {}, visible = false) {
    const contenidoBase = String(html || "").trim();
    const root = document.createElement("div");
    const contenidoRenderizado = typeof renderizarContenidoModulo === "function"
        ? renderizarContenidoModulo(contenidoBase, modulo?.tipo || "")
        : contenidoBase;
    root.innerHTML = contenidoRenderizado && !/Sin contenido generado/i.test(contenidoRenderizado)
        ? contenidoRenderizado
        : "";

    root.innerHTML = quitarActividadOriginalDelContenido(root.innerHTML);
    if (visible) {
        const bloqueActividadOriginal = construirActividadOriginalHtmlModulo(modulo);
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

window.aplicarVisibilidadActividadOriginalEnContenido = aplicarVisibilidadActividadOriginalEnContenido;

let moduloActionsFloatingMenu = null;
let moduloActionsFloatingMenuTrigger = null;

function obtenerMenuAccionesModuloFlotante() {
    if (moduloActionsFloatingMenu && document.body.contains(moduloActionsFloatingMenu)) {
        return moduloActionsFloatingMenu;
    }
    const node = document.createElement("div");
    node.id = "cbModuleActionsFloatingMenu";
    node.className = "cb-module-actions-menu__floating-panel hidden";
    node.setAttribute("role", "menu");
    document.body.appendChild(node);
    moduloActionsFloatingMenu = node;
    return node;
}

function cerrarMenuAccionesModuloFlotante() {
    const menu = obtenerMenuAccionesModuloFlotante();
    menu.classList.add("hidden");
    menu.innerHTML = "";
    if (moduloActionsFloatingMenuTrigger) {
        moduloActionsFloatingMenuTrigger.setAttribute("aria-expanded", "false");
    }
    moduloActionsFloatingMenuTrigger = null;
}

function posicionarMenuAccionesModuloFlotante(menu, trigger) {
    if (!menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 12;

    menu.style.top = "0px";
    menu.style.left = "0px";
    menu.classList.remove("hidden");

    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 8;

    if (left < margin) left = margin;
    if (left + menuRect.width > viewportWidth - margin) {
        left = Math.max(margin, viewportWidth - menuRect.width - margin);
    }
    if (top + menuRect.height > viewportHeight - margin) {
        top = Math.max(margin, rect.top - menuRect.height - 8);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

window.toggleMenuAccionesModulo = function(actionEl) {
    const trigger = actionEl?.closest?.(".cb-module-actions-menu__trigger") || null;
    if (!trigger) return;
    const menuRoot = trigger.closest(".cb-module-actions-menu");
    const sourcePanel = menuRoot?.querySelector(".cb-module-actions-menu__panel");
    if (!sourcePanel) return;

    const menu = obtenerMenuAccionesModuloFlotante();
    const sameTrigger = moduloActionsFloatingMenuTrigger === trigger && !menu.classList.contains("hidden");
    if (sameTrigger) {
        cerrarMenuAccionesModuloFlotante();
        return;
    }

    cerrarMenuAccionesModuloFlotante();
    menu.innerHTML = sourcePanel.innerHTML;
    moduloActionsFloatingMenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    posicionarMenuAccionesModuloFlotante(menu, trigger);
};

document.addEventListener("click", (event) => {
    if (event.target.closest(".cb-module-actions-menu")) return;
    if (event.target.closest(".cb-module-actions-menu__floating-panel")) return;
    cerrarMenuAccionesModuloFlotante();
});

window.addEventListener("resize", () => {
    if (!moduloActionsFloatingMenuTrigger || !moduloActionsFloatingMenu || moduloActionsFloatingMenu.classList.contains("hidden")) return;
    posicionarMenuAccionesModuloFlotante(moduloActionsFloatingMenu, moduloActionsFloatingMenuTrigger);
});

window.addEventListener("scroll", () => {
    if (!moduloActionsFloatingMenuTrigger || !moduloActionsFloatingMenu || moduloActionsFloatingMenu.classList.contains("hidden")) return;
    posicionarMenuAccionesModuloFlotante(moduloActionsFloatingMenu, moduloActionsFloatingMenuTrigger);
}, true);

window.agregarActividadOriginalAlModulo = async function(moduloId) {
    const cursoIdModulo = String(curso?.id || "").trim() || null;
    const modulo = await obtenerModulo(moduloId, cursoIdModulo);
    if (!modulo) {
        alert("No se encontró el módulo.");
        return;
    }
    const mostrarActual = modulo.mostrarActividadOriginal !== false;
    const nuevaVisibilidad = !mostrarActual;
    const payloadLocal = {
        mostrarActividadOriginal: nuevaVisibilidad
    };

    sincronizarModuloLocal(moduloId, cursoIdModulo, payloadLocal);

    const card = document.getElementById(`modulo-${moduloId}`);
    if (card) {
        card.classList.toggle("modulo-original-oculta", !nuevaVisibilidad);
        const icon = card.querySelector('[data-mc-action="agregar-actividad-original-modulo"] i');
        if (icon) {
            icon.classList.toggle("fa-eye", nuevaVisibilidad);
            icon.classList.toggle("fa-eye-slash", !nuevaVisibilidad);
        }
        const originalBlock = card.querySelector(".word-instruccion-original");
        if (originalBlock) {
            originalBlock.hidden = !nuevaVisibilidad;
        }
    }

    await guardarModulo(moduloId, payloadLocal, cursoIdModulo);

    const moduloActualizado = {
        ...modulo,
        mostrarActividadOriginal: nuevaVisibilidad
    };
    modulosCache.set(construirDocIdModulo(moduloId, cursoIdModulo), moduloActualizado);
    if (window.subtemaActivo?.modulos && Array.isArray(window.subtemaActivo.modulos)) {
        const target = window.subtemaActivo.modulos.find((item) => String(item?.id || "").trim() === String(moduloId || "").trim());
        if (target) Object.assign(target, moduloActualizado);
    }
    renderTemas();
    mostrarNotificacion(nuevaVisibilidad ? "Actividad original mostrada." : "Actividad original oculta.", "success");
};

function limpiarRespuestaTraduccionModulo(texto = "", tipoModulo = "") {
    let limpio = String(texto || "");
    limpio = limpio.replace(/```html/gi, "").replace(/```/g, "");
    limpio = limpio.replace(/^\s*#{6,}\s*$/gm, "");
    limpio = limpio.replace(/\n{3,}/g, "\n\n").trim();

    if (!limpio) return "";

    if (typeof renderizarContenidoModulo === "function") {
        return renderizarContenidoModulo(limpio, tipoModulo);
    }

    if (limpio.includes("<") && limpio.includes(">")) {
        return sanitizarHtmlEditorial(limpio);
    }

    return `<p>${escapeHtml(limpio).replace(/\n/g, "<br>")}</p>`;
}

function crearEstilosWordCurso() {
    return `
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #0f172a; line-height: 1.6; margin: 24px; }
    h1, h2, h3, h4 { font-weight: bold; color: #0f172a; }
    p { margin: 0 0 14px 0; }
    ul, ol { margin: 10px 0 18px 24px; padding-left: 14px; }
    li { margin: 0 0 8px 0; }
    table { border-collapse: collapse; width: 94%; margin: 12px auto 24px auto; font-size: 10.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    th { background: transparent; text-align: center; }
    .word-doc-title { font-size: 24pt; line-height: 1.15; margin: 0 0 16px 0; font-weight: 700; }
    .word-subtema-title { font-size: 18pt; margin: 22px 0 14px 0; font-weight: 700; }
    .word-section-title { font-size: 13pt; margin: 18px 0 12px 0; font-weight: 700; color: #334155; }
    .modulo { margin: 0 0 24px 0; padding: 0; border: 0; background: transparent; page-break-inside: avoid; }
    .modulo-nombre-word { font-size: 16pt !important; line-height: 1.2 !important; font-weight: 700 !important; margin: 0 0 14px 0 !important; }
    .word-titulo2, .cb-module-block-title { font-size: 14pt !important; font-weight: 700 !important; margin: 18px 0 12px 0 !important; padding-bottom: 0; border-bottom: 0; }
    .word-instruccion-original { margin: 12px 0 18px 0; padding: 0; border: 0; background: transparent; }
    .word-instruccion-original h4 { font-size: 12pt !important; margin: 0 0 8px 0 !important; font-weight: 700 !important; }
    .word-propuesta-generada { margin-top: 0; padding: 0; border: 0; }
    .cb-module-original-body { margin-bottom: 18px; padding-bottom: 0; border-bottom: 0; }
    .cb-module-meta-line.is-question { font-weight: 700; margin-bottom: 16px; }
    .cb-module-meta-line.is-options { font-weight: 700; margin-bottom: 14px; }
    .cb-module-feedback-line { margin: 12px 0 18px 0; padding: 0; border-left: 0; }
    .cb-module-feedback-line.is-answer { font-weight: 700; }
    .cb-module-feedback-line.is-correct { }
    .cb-module-feedback-line.is-incorrect { }
    .cb-module-feedback-line.is-global { }
    .cb-module-section-separator { display: none; height: 0; margin: 0; border: 0; }
    .cb-module-alpha-options { list-style: none; margin-left: 0; padding-left: 0; }
    .cb-module-alpha-options li { margin: 0 0 10px 0; }
    `;
}

async function construirDocumentoWordSubtema(subtema) {
    const tituloSubtema = escapeHtml(subtema?.nombre || "Subtema");
    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${tituloSubtema}</title>
<style>
    ${crearEstilosWordCurso()}
</style>
</head>
<body>
<h1 class="word-doc-title">${tituloSubtema}</h1>
`;

    const contenidoGenerado = String(subtema?.contenidoGenerado || "").trim();
    if (contenidoGenerado) {
        html += `
        <section>
            <h2 class="word-section-title">Introducción</h2>
            ${construirContenidoHtmlWord(contenidoGenerado)}
        </section>
        `;
    }

    html += `<section><h2 class="word-section-title">Módulos</h2>`;

    if (!subtema?.modulosIds?.length) {
        html += `<p>(Sin módulos)</p>`;
    } else {
        for (const modId of subtema.modulosIds) {
            const modulo = await obtenerModulo(modId);
            if (!modulo || modulo.archivado) continue;
            html += construirContenidoModuloWord(modulo);
        }
    }

    html += `</section></body></html>`;
    return html;
}

async function exportarTemaWord(tema) {

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${tema.nombre}</title>
<style>
    ${crearEstilosWordCurso()}
    .subtema { margin-top: 25px; }
    .modulo { margin-top: 15px; }
</style>
</head>
<body>

<h1 class="word-doc-title">${tema.nombre}</h1>
`;

    // Recorrer todos los subtemas del tema
    for (const sub of tema.subtemas) {

        html += `
        <div class="subtema">
            <h2 class="word-subtema-title">${sub.nombre}</h2>

            <h3 class="word-section-title">Introducción</h3>
            ${construirContenidoHtmlWord(sub.contenidoGenerado || "<p>(Sin contenido)</p>")}

            <h3 class="word-section-title">Módulos</h3>
        `;

        // SI NO TIENE MODULOS
        if (!sub.modulosIds || sub.modulosIds.length === 0) {
            html += `<p>(Sin módulos)</p>`;
        } else {

            // 🔥 Cargar cada módulo desde Firebase
            for (const modId of sub.modulosIds) {

                const modulo = await obtenerModulo(modId);

                if (!modulo) {
                    html += `<p>(Módulo no encontrado)</p>`;
                    continue;
                }
                if (modulo.archivado) {
                    continue;
                }

                html += construirContenidoModuloWord(modulo);
            }
        }

        html += `</div>`;
    }

    html += `
</body>
</html>
`;

    // EXPORTAR A WORD
    try {
        const blob = window.htmlDocx.asBlob(html);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${tema.nombre}.docx`;
        a.click();
    } catch (e) {
        alert("Error exportando el tema a Word");
    }
}

async function exportarCursoCompletoWord(cursoActual, { incluirArchivados = false } = {}) {
    if (!cursoActual?.temas?.length) {
        alert("No hay un curso cargado para exportar.");
        return;
    }

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(cursoActual.nombre || "Curso")}</title>
<style>
    ${crearEstilosWordCurso()}
    .tema { margin-top: 30px; page-break-inside: avoid; }
    .subtema { margin-top: 22px; }
</style>
</head>
<body>
<h1 class="word-doc-title">${escapeHtml(cursoActual.nombre || "Curso")}</h1>
`;

    for (const tema of (cursoActual.temas || [])) {
        html += `
        <section class="tema">
            <h2 class="word-subtema-title">${escapeHtml(tema?.nombre || "Tema")}</h2>
        `;

        if (!tema?.subtemas?.length) {
            html += `<p>(Sin subtemas)</p>`;
        } else {
            for (const sub of tema.subtemas) {
                html += `
                <div class="subtema">
                    <h3 class="word-section-title">${escapeHtml(sub?.nombre || "Subtema")}</h3>
                `;

                const contenidoGenerado = String(sub?.contenidoGenerado || "").trim();
                if (contenidoGenerado) {
                    html += `
                        <section>
                            <h4 class="word-section-title">Introducción</h4>
                            ${construirContenidoHtmlWord(contenidoGenerado)}
                        </section>
                    `;
                }

                if (!sub?.modulosIds?.length) {
                    html += `<p>(Sin módulos)</p>`;
                } else {
                    for (const modId of sub.modulosIds) {
                        const modulo = await obtenerModulo(modId);
                        if (!modulo) continue;
                        if (modulo.archivado && !incluirArchivados) continue;
                        html += construirContenidoModuloWord(modulo);
                    }
                }

                html += `</div>`;
            }
        }

        html += `</section>`;
    }

    html += `
</body>
</html>
`;

    try {
        const blob = window.htmlDocx.asBlob(html);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${cursoActual.nombre || "Curso"}.docx`;
        a.click();
    } catch (e) {
        alert("Error exportando el curso a Word");
    }
}

// btnDescargarCursoWord eliminado del UI.


/* ======================================================
   FUNCIONES PARA MANEJAR CONTENIDO ENRIQUECIDO EN MODAL GEMINI
====================================================== */

// Variable global para almacenar selección actual
let currentGeminiSelection = null;
let geminiToolbarInicializado = false;

function obtenerEditorGemini() {
    return document.getElementById('txtModalInstruccionesGemini');
}

function obtenerCacheRuntimeImagenesGemini() {
    if (!window.__cbGeminiInstructionImageRuntimeCache || typeof window.__cbGeminiInstructionImageRuntimeCache !== "object") {
        window.__cbGeminiInstructionImageRuntimeCache = {};
    }
    return window.__cbGeminiInstructionImageRuntimeCache;
}

function obtenerImagenesGeminiPorModulo(moduloId = "") {
    const key = String(moduloId || "").trim();
    if (!key) return {};
    const cache = obtenerCacheRuntimeImagenesGemini();
    const scoped = cache[key];
    return scoped && typeof scoped === "object" ? scoped : {};
}

function guardarImagenesGeminiPorModulo(moduloId = "", imageMap = {}) {
    const key = String(moduloId || "").trim();
    if (!key) return;
    const cache = obtenerCacheRuntimeImagenesGemini();
    cache[key] = imageMap && typeof imageMap === "object" ? imageMap : {};
}

function limpiarImagenesGeminiPorModulo(moduloId = "") {
    const key = String(moduloId || "").trim();
    if (!key) return;
    const cache = obtenerCacheRuntimeImagenesGemini();
    delete cache[key];
}

function sanitizarNombreImagenGemini(value = "", fallback = "imagen") {
    const clean = String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
    return clean || fallback;
}

function sanitizarInstruccionesImagenes(imagenes = []) {
    if (!Array.isArray(imagenes)) return [];
    return imagenes
        .map((item, index) => {
            const imageId = String(item?.imageId || "").trim() || `gemimg_meta_${index + 1}`;
            const downloadUrl = String(item?.downloadUrl || "").trim();
            const storagePath = String(item?.storagePath || "").trim();
            const mimeType = String(item?.mimeType || "").trim().toLowerCase();
            if (!downloadUrl && !storagePath) return null;
            return {
                imageId,
                storagePath,
                downloadUrl,
                mimeType: mimeType.startsWith("image/") ? mimeType : "image/png",
                name: sanitizarNombreImagenGemini(item?.name || `imagen_${index + 1}`),
                origin: String(item?.origin || "storage").trim() || "storage",
                updatedAt: String(item?.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
            };
        })
        .filter(Boolean)
        .slice(0, 24);
}

function crearMapaImagenesGemini(records = [], runtimeMap = {}) {
    const map = {};
    sanitizarInstruccionesImagenes(records).forEach((item) => {
        map[item.imageId] = { ...item };
    });
    Object.entries(runtimeMap && typeof runtimeMap === "object" ? runtimeMap : {}).forEach(([imageId, value]) => {
        if (!imageId || !value || typeof value !== "object") return;
        map[imageId] = {
            ...(map[imageId] || {}),
            ...value,
            imageId
        };
    });
    return map;
}

function esUrlFirebaseStorageGemini(url = "") {
    const clean = String(url || "").trim();
    if (!clean) return false;
    try {
        const parsed = new URL(clean);
        const host = String(parsed.hostname || "").toLowerCase();
        return host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com";
    } catch (_) {
        return false;
    }
}

function construirMetadataImagenGemini({
    imageId = "",
    name = "imagen",
    mimeType = "image/png",
    downloadUrl = "",
    storagePath = "",
    origin = "storage",
    updatedAt = ""
} = {}) {
    return {
        imageId: String(imageId || crearGeminiImageId()).trim() || crearGeminiImageId(),
        name: sanitizarNombreImagenGemini(name),
        mimeType: String(mimeType || "image/png").trim().toLowerCase() || "image/png",
        downloadUrl: String(downloadUrl || "").trim(),
        storagePath: String(storagePath || "").trim(),
        origin: String(origin || "storage").trim() || "storage",
        updatedAt: String(updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
    };
}

function obtenerImagenesGeminiPersistidasDesdeModulo(modulo = {}) {
    return sanitizarInstruccionesImagenes(modulo?.instruccionesImagenes);
}

function obtenerMapaImagenesGeminiDesdeModulo(modulo = {}, moduloId = "") {
    return crearMapaImagenesGemini(
        obtenerImagenesGeminiPersistidasDesdeModulo(modulo),
        obtenerImagenesGeminiPorModulo(moduloId || modulo?.id || "")
    );
}

function limpiarDataUrlsInstruccionesGemini(html = "") {
    return String(html || "")
        .replace(/<img[^>]+src=["']data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+["'][^>]*>/gi, "")
        .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "")
        .trim();
}

function normalizarHtmlInstruccionesGeminiParaEstadoLocal(html = "", moduloId = "", imageRecords = []) {
    const raw = normalizarHtmlLegacyImagenGemini(String(html || ""));
    if (!raw.trim()) return "";
    const imageMap = crearMapaImagenesGemini(imageRecords, obtenerImagenesGeminiPorModulo(moduloId));
    const container = document.createElement("div");
    container.innerHTML = sanitizeRichText(raw);
    container.querySelectorAll("img").forEach((img, index) => {
        let imageId = String(img.getAttribute("data-gemini-image-id") || "").trim();
        if (!imageId) imageId = crearGeminiImageId();
        img.setAttribute("data-gemini-image-id", imageId);
        const src = String(img.getAttribute("src") || "").trim();
        const meta = imageMap[imageId] || {};
        const downloadUrl = String(img.getAttribute("data-gemini-storage-url") || meta.downloadUrl || "").trim();
        const storagePath = String(img.getAttribute("data-gemini-storage-path") || meta.storagePath || "").trim();
        if (downloadUrl) {
            img.setAttribute("src", downloadUrl);
            img.setAttribute("data-gemini-storage-url", downloadUrl);
        } else if (src.startsWith("data:image/")) {
            img.setAttribute("src", construirPlaceholderImagenGemini(imageId));
            img.removeAttribute("data-gemini-storage-url");
        } else if (!src || /^https?:\/\//i.test(src)) {
            img.setAttribute("src", construirPlaceholderImagenGemini(imageId));
        }
        if (storagePath) {
            img.setAttribute("data-gemini-storage-path", storagePath);
        } else {
            img.removeAttribute("data-gemini-storage-path");
        }
    });
    return sanitizarHtmlEditorial(limpiarDataUrlsInstruccionesGemini(container.innerHTML));
}

function obtenerExtensionImagenGemini(mimeType = "image/png") {
    const clean = String(mimeType || "").trim().toLowerCase();
    if (clean === "image/jpeg") return "jpg";
    if (clean === "image/webp") return "webp";
    if (clean === "image/gif") return "gif";
    return "png";
}

function dataUrlABlobGemini(dataUrl = "") {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match?.[1] || !match?.[2]) {
        throw new Error("No se pudo convertir la imagen de instrucciones.");
    }
    const mimeType = match[1];
    const bytes = atob(match[2]);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mimeType });
}

async function subirImagenInstruccionGeminiAFirebaseStorage({
    moduloId = "",
    cursoId = "",
    imageId = "",
    dataUrl = "",
    nombre = "imagen"
} = {}) {
    const user = auth.currentUser;
    if (!user?.uid) {
        throw new Error("Debes iniciar sesión para guardar imágenes de las instrucciones.");
    }
    const blob = dataUrlABlobGemini(dataUrl);
    const mimeType = String(blob.type || "image/png").trim() || "image/png";
    const ext = obtenerExtensionImagenGemini(mimeType);
    const safeCourseId = String(cursoId || curso?.id || "curso").trim() || "curso";
    const safeModuleId = String(moduloId || "modulo").trim() || "modulo";
    const safeImageId = String(imageId || crearGeminiImageId()).trim() || crearGeminiImageId();
    const path = `images/${user.uid}/moodle-instructions/${safeCourseId}/${safeModuleId}/${safeImageId}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, blob, {
        contentType: mimeType,
        customMetadata: {
            origin: "moodleCourseInstructions",
            courseId: safeCourseId,
            moduleId: safeModuleId,
            imageId: safeImageId,
            fileName: String(nombre || `imagen_${safeImageId}`).trim()
        }
    });
    const downloadUrl = await getDownloadURL(ref);
    return {
        downloadUrl,
        storagePath: path,
        mimeType,
        origin: "clipboard",
        updatedAt: new Date().toISOString()
    };
}

async function importarImagenRemotaInstruccionGemini({
    moduloId = "",
    cursoId = "",
    imageId = "",
    sourceUrl = "",
    nombre = "imagen"
} = {}) {
    const data = await authFetchJson("/api/moodle/instruction-images/import", {
        method: "POST",
        body: {
            courseId: String(cursoId || curso?.id || "").trim(),
            moduleId: String(moduloId || "").trim(),
            imageId: String(imageId || crearGeminiImageId()).trim(),
            sourceUrl: String(sourceUrl || "").trim(),
            name: sanitizarNombreImagenGemini(nombre),
            origin: "remote"
        }
    });
    return {
        downloadUrl: String(data?.image?.downloadUrl || "").trim(),
        storagePath: String(data?.image?.storagePath || "").trim(),
        mimeType: String(data?.image?.mimeType || "image/png").trim().toLowerCase() || "image/png",
        origin: String(data?.image?.origin || "remote").trim() || "remote",
        updatedAt: String(data?.image?.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
    };
}

function crearGeminiImageId() {
    return `gemimg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function construirPlaceholderImagenGemini(imageId = "") {
    const safeId = encodeURIComponent(String(imageId || "").trim());
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
            <rect width="640" height="360" fill="#eef2ff"/>
            <rect x="24" y="24" width="592" height="312" rx="24" fill="#dbe4ff" stroke="#9aa8d6" stroke-width="2"/>
            <text x="320" y="154" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#334155">
                Imagen de referencia
            </text>
            <text x="320" y="194" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#64748b">
                ${safeId}
            </text>
        </svg>`
    )}`;
}

function normalizarHtmlLegacyImagenGemini(html = "") {
    const raw = String(html || "");
    if (!raw.includes("https://gemini.local/reference-image/")) return raw;
    return raw.replace(
        /<img\b([^>]*?)src=["']https:\/\/gemini\.local\/reference-image\/([^"']+)["']([^>]*?)>/gi,
        (match, before = "", encodedId = "", after = "") => {
            const imageId = decodeURIComponent(String(encodedId || "").trim());
            const mergedAttrs = `${before || ""} ${after || ""}`;
            const hasImageIdAttr = /\bdata-gemini-image-id\s*=\s*["'][^"']+["']/i.test(mergedAttrs);
            const imageIdAttr = hasImageIdAttr ? "" : ` data-gemini-image-id="${sanitizeAttrGemini(imageId)}"`;
            return `<img${before || ""} src="${construirPlaceholderImagenGemini(imageId)}"${imageIdAttr}${after || ""}>`;
        }
    );
}

function hidratarHtmlInstruccionesGemini(html = "", moduloId = "", imageRecords = []) {
    const raw = normalizarHtmlLegacyImagenGemini(html);
    if (!raw.trim()) return "";
    const cache = crearMapaImagenesGemini(imageRecords, obtenerImagenesGeminiPorModulo(moduloId));
    const container = document.createElement("div");
    container.innerHTML = raw;
    container.querySelectorAll("img[data-gemini-image-id]").forEach((img) => {
        const imageId = String(img.getAttribute("data-gemini-image-id") || "").trim();
        const storedUrl = String(
            img.getAttribute("data-gemini-storage-url") ||
            cache?.[imageId]?.downloadUrl ||
            ""
        ).trim();
        const dataUrl = String(cache?.[imageId]?.dataUrl || "").trim();
        if (dataUrl.startsWith("data:image/")) {
            img.setAttribute("src", dataUrl);
            return;
        }
        if (/^https?:\/\//i.test(storedUrl)) {
            img.setAttribute("src", storedUrl);
            img.setAttribute("data-gemini-storage-url", storedUrl);
            const storagePath = String(
                img.getAttribute("data-gemini-storage-path") ||
                cache?.[imageId]?.storagePath ||
                ""
            ).trim();
            if (storagePath) img.setAttribute("data-gemini-storage-path", storagePath);
            return;
        }
        if (imageId) {
            img.setAttribute("src", construirPlaceholderImagenGemini(imageId));
            return;
        }
        img.remove();
    });
    container.querySelectorAll('img[src^="https://gemini.local/reference-image/"]').forEach((img) => {
        const existingId = String(img.getAttribute("data-gemini-image-id") || "").trim();
        const fallbackId = existingId || decodeURIComponent(
            String(img.getAttribute("src") || "").trim().split("/").pop() || ""
        );
        if (fallbackId) {
            img.setAttribute("data-gemini-image-id", fallbackId);
            const dataUrl = String(cache?.[fallbackId]?.dataUrl || "").trim();
            if (dataUrl.startsWith("data:image/")) {
                img.setAttribute("src", dataUrl);
                return;
            }
            const storedUrl = String(cache?.[fallbackId]?.downloadUrl || "").trim();
            if (/^https?:\/\//i.test(storedUrl)) {
                img.setAttribute("src", storedUrl);
                img.setAttribute("data-gemini-storage-url", storedUrl);
                if (cache?.[fallbackId]?.storagePath) {
                    img.setAttribute("data-gemini-storage-path", String(cache[fallbackId].storagePath));
                }
                return;
            }
            img.setAttribute("src", construirPlaceholderImagenGemini(fallbackId));
            return;
        }
    });
    return container.innerHTML;
}

async function prepararHtmlInstruccionesGeminiParaGuardar(html = "", moduloId = "", cursoId = "") {
    const key = String(moduloId || "").trim();
    if (!key) {
        return {
            html: sanitizarHtmlEditorial(limpiarDataUrlsInstruccionesGemini(sanitizeRichText(normalizarHtmlLegacyImagenGemini(html)))),
            imagenes: [],
            warnings: []
        };
    }
    const container = document.createElement("div");
    container.innerHTML = sanitizeRichText(normalizarHtmlLegacyImagenGemini(String(html || "").trim()));
    const nextCache = { ...obtenerImagenesGeminiPorModulo(key) };
    const usedIds = new Set();
    const warnings = [];

    const imageNodes = Array.from(container.querySelectorAll("img"));
    for (const [index, img] of imageNodes.entries()) {
        const src = String(img.getAttribute("src") || "").trim();
        let imageId = String(img.getAttribute("data-gemini-image-id") || "").trim();
        if (!imageId && src.startsWith("https://gemini.local/reference-image/")) {
            imageId = decodeURIComponent(src.split("/").pop() || "");
        }
        if (!imageId) imageId = crearGeminiImageId();
        const alt = String(img.getAttribute("alt") || `imagen_${index + 1}`).trim() || `imagen_${index + 1}`;
        let downloadUrl = String(img.getAttribute("data-gemini-storage-url") || nextCache?.[imageId]?.downloadUrl || "").trim();
        let storagePath = String(img.getAttribute("data-gemini-storage-path") || nextCache?.[imageId]?.storagePath || "").trim();
        let mimeType = String(nextCache?.[imageId]?.mimeType || "").trim().toLowerCase();
        let origin = String(nextCache?.[imageId]?.origin || (src.startsWith("data:image/") ? "clipboard" : "storage")).trim() || "storage";

        if (src.startsWith("data:image/")) {
            const uploaded = await subirImagenInstruccionGeminiAFirebaseStorage({
                moduloId: key,
                cursoId,
                imageId,
                dataUrl: src,
                nombre: alt
            });
            nextCache[imageId] = {
                ...construirMetadataImagenGemini({
                    imageId,
                    name: alt,
                    mimeType: String(uploaded?.mimeType || src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || "image/png").trim(),
                    downloadUrl: uploaded.downloadUrl,
                    storagePath: uploaded.storagePath,
                    origin: uploaded.origin || "clipboard",
                    updatedAt: uploaded.updatedAt
                })
            };
            downloadUrl = String(uploaded.downloadUrl || "").trim();
            storagePath = String(uploaded.storagePath || "").trim();
            mimeType = String(uploaded?.mimeType || mimeType || "image/png").trim().toLowerCase();
            origin = String(uploaded?.origin || "clipboard").trim() || "clipboard";
        } else if (/^https?:\/\//i.test(src)) {
            if (esUrlFirebaseStorageGemini(src)) {
                downloadUrl = src;
                origin = "storage";
            } else {
                try {
                    const imported = await importarImagenRemotaInstruccionGemini({
                        moduloId: key,
                        cursoId,
                        imageId,
                        sourceUrl: src,
                        nombre: alt
                    });
                    nextCache[imageId] = {
                        ...construirMetadataImagenGemini({
                            imageId,
                            name: alt,
                            mimeType: imported.mimeType || mimeType || "image/png",
                            downloadUrl: imported.downloadUrl,
                            storagePath: imported.storagePath,
                            origin: imported.origin || "remote",
                            updatedAt: imported.updatedAt
                        })
                    };
                    downloadUrl = String(imported.downloadUrl || "").trim();
                    storagePath = String(imported.storagePath || "").trim();
                    mimeType = String(imported?.mimeType || mimeType || "image/png").trim().toLowerCase();
                    origin = String(imported?.origin || "remote").trim() || "remote";
                } catch (error) {
                    warnings.push(`No se pudo importar una imagen remota (${alt}). Se removió del módulo.`);
                    console.warn("No se pudo importar imagen remota de instrucciones Gemini:", {
                        moduloId: key,
                        imageId,
                        src,
                        error: String(error?.message || error || "")
                    });
                    img.remove();
                    delete nextCache[imageId];
                    continue;
                }
            }
        } else if (nextCache?.[imageId]?.dataUrl) {
            const uploaded = await subirImagenInstruccionGeminiAFirebaseStorage({
                moduloId: key,
                cursoId,
                imageId,
                dataUrl: String(nextCache[imageId].dataUrl || ""),
                nombre: alt
            });
            nextCache[imageId] = {
                ...construirMetadataImagenGemini({
                    ...nextCache[imageId],
                    imageId,
                    name: alt,
                    mimeType: String(uploaded?.mimeType || nextCache[imageId]?.mimeType || "image/png").trim(),
                    downloadUrl: uploaded.downloadUrl,
                    storagePath: uploaded.storagePath,
                    origin: uploaded.origin || nextCache[imageId]?.origin || "clipboard",
                    updatedAt: uploaded.updatedAt
                })
            };
            downloadUrl = String(uploaded.downloadUrl || "").trim();
            storagePath = String(uploaded.storagePath || "").trim();
            mimeType = String(uploaded?.mimeType || mimeType || "image/png").trim().toLowerCase();
            origin = String(uploaded?.origin || origin || "clipboard").trim() || "clipboard";
        } else if (downloadUrl || storagePath) {
            nextCache[imageId] = {
                ...construirMetadataImagenGemini({
                    ...nextCache[imageId],
                    imageId,
                    name: alt,
                    mimeType: mimeType || "image/png",
                    downloadUrl,
                    storagePath,
                    origin,
                    updatedAt: nextCache?.[imageId]?.updatedAt || new Date().toISOString()
                })
            };
        }

        if (!downloadUrl) {
            warnings.push(`Se eliminó una imagen sin referencia persistible (${alt}).`);
            img.remove();
            delete nextCache[imageId];
            continue;
        }

        usedIds.add(imageId);
        img.setAttribute("data-gemini-image-id", imageId);
        img.setAttribute("src", downloadUrl);
        img.setAttribute("data-gemini-storage-url", downloadUrl);
        if (storagePath) img.setAttribute("data-gemini-storage-path", storagePath);
        img.setAttribute("alt", alt);
        img.setAttribute("title", alt);
    }

    const trimmedCache = {};
    usedIds.forEach((imageId) => {
        if (!nextCache[imageId]) return;
        const safe = { ...nextCache[imageId] };
        delete safe.dataUrl;
        trimmedCache[imageId] = safe;
    });
    container.querySelectorAll("figure").forEach((figure) => {
        const hasImage = figure.querySelector("img");
        if (!hasImage && !String(figure.textContent || "").trim()) {
            figure.remove();
        }
    });
    guardarImagenesGeminiPorModulo(key, trimmedCache);
    return {
        html: sanitizarHtmlEditorial(limpiarDataUrlsInstruccionesGemini(container.innerHTML.trim())),
        imagenes: sanitizarInstruccionesImagenes(Object.values(trimmedCache)),
        warnings
    };
}

async function repararInstruccionesGeminiDeModulo(modulo = {}, cursoId = "") {
    const moduloId = String(modulo?.id || "").trim();
    if (!moduloId) return { modulo, changed: false, warnings: [] };
    const prepared = await prepararHtmlInstruccionesGeminiParaGuardar(
        String(modulo?.instrucciones || ""),
        moduloId,
        cursoId || modulo?.cursoId || curso?.id || ""
    );
    const imagenesActuales = JSON.stringify(sanitizarInstruccionesImagenes(modulo?.instruccionesImagenes));
    const imagenesPreparadas = JSON.stringify(prepared.imagenes);
    const instruccionesActuales = String(modulo?.instrucciones || "").trim();
    const instruccionesPreparadas = String(prepared?.html || "").trim();
    const changed = instruccionesActuales !== instruccionesPreparadas || imagenesActuales !== imagenesPreparadas;
    return {
        modulo: {
            ...modulo,
            instrucciones: instruccionesPreparadas,
            instruccionesImagenes: prepared.imagenes
        },
        changed,
        warnings: Array.isArray(prepared?.warnings) ? prepared.warnings : []
    };
}

function escapeHtmlGemini(texto = "") {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function contieneTablaEnHtml(html = "") {
    return /<table[\s\S]*?>[\s\S]*?<\/table>/i.test(html);
}

function esTextoTabular(texto = "") {
    if (!texto) return false;
    const lineas = texto
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    if (lineas.length < 1) return false;

    const conTab = lineas.filter(l => l.includes('\t'));
    if (conTab.length === 0) return false;
    if (lineas.length === 1) return conTab[0].split('\t').length > 1;

    // Al menos dos filas con dos columnas para tratarlo como tabla.
    return conTab.length >= 2 && conTab.every(l => l.split('\t').length > 1);
}

function convertirTextoTabularATablaHTML(texto = "") {
    const filas = texto
        .split(/\r?\n/)
        .map(f => f.trim())
        .filter(Boolean)
        .map(f => f.split('\t').map(c => escapeHtmlGemini(c.trim())));

    if (!filas.length) return "";
    if (filas.length === 1 && filas[0].length < 2) return "";

    const cabecera = filas[0];
    const cuerpo = filas.slice(1);

    const thead = `<thead><tr>${cabecera.map(c => `<th class="cb-editor-table-th">${c || "&nbsp;"}</th>`).join("")}</tr></thead>`;
    const tbodyFilas = (cuerpo.length ? cuerpo : [Array.from({ length: 1 }, () => "")])
        .map(f => `<tr>${f.map(c => `<td class="cb-editor-table-td">${c || "&nbsp;"}</td>`).join("")}</tr>`)
        .join("");

    return `<table class="cb-editor-table">${thead}<tbody>${tbodyFilas}</tbody></table>`;
}

function insertarHtmlEnEditorGemini(html = "") {
    if (!html) return;
    document.execCommand('insertHTML', false, html);
    guardarSeleccionGemini();
}

function prepararHtmlPegadoEnEditorGemini(html = "") {
    const raw = String(html || "").trim();
    if (!raw) return "";
    const container = document.createElement("div");
    container.innerHTML = raw;
    container.querySelectorAll("script, style").forEach((node) => node.remove());
    container.querySelectorAll("*").forEach((node) => {
        Array.from(node.attributes || []).forEach((attr) => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        });
    });
    container.querySelectorAll("img").forEach((img, index) => {
        const src = String(img.getAttribute("src") || "").trim();
        let imageId = String(img.getAttribute("data-gemini-image-id") || "").trim();
        if (!imageId) imageId = crearGeminiImageId();
        img.setAttribute("data-gemini-image-id", imageId);
        img.removeAttribute("srcset");
        if (src.startsWith("data:image/")) {
            img.setAttribute("data-gemini-image-origin", "clipboard");
            img.removeAttribute("data-gemini-storage-url");
            img.removeAttribute("data-gemini-storage-path");
            return;
        }
        if (/^https?:\/\//i.test(src)) {
            img.setAttribute("data-gemini-image-origin", esUrlFirebaseStorageGemini(src) ? "storage" : "remote-pending");
            if (esUrlFirebaseStorageGemini(src)) {
                img.setAttribute("data-gemini-storage-url", src);
            } else {
                img.removeAttribute("data-gemini-storage-url");
                img.removeAttribute("data-gemini-storage-path");
            }
            return;
        }
        img.setAttribute("alt", String(img.getAttribute("alt") || `imagen_${index + 1}`).trim() || `imagen_${index + 1}`);
    });
    return container.innerHTML;
}

function fileToDataUrlGemini(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(file);
    });
}

function loadImageElementFromDataUrlGemini(dataUrl = "") {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo decodificar la imagen."));
        img.src = String(dataUrl || "");
    });
}

function canvasToDataUrlGemini(canvas, mimeType = "image/webp", quality = 0.72) {
    try {
        return canvas.toDataURL(mimeType, quality);
    } catch (_) {
        if (mimeType !== "image/jpeg") {
            return canvas.toDataURL("image/jpeg", Math.max(0.65, quality));
        }
        throw new Error("No se pudo exportar la imagen optimizada.");
    }
}

async function optimizarImagenGemini(file) {
    const originalDataUrl = await fileToDataUrlGemini(file);
    const image = await loadImageElementFromDataUrlGemini(originalDataUrl);
    const maxSide = 1280;
    const width = Math.max(1, Number(image.naturalWidth || image.width || 1));
    const height = Math.max(1, Number(image.naturalHeight || image.height || 1));
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No se pudo preparar la compresión de imagen.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    let optimizedDataUrl = canvasToDataUrlGemini(canvas, "image/webp", 0.72);
    if (optimizedDataUrl.length > 700000) {
        optimizedDataUrl = canvasToDataUrlGemini(canvas, "image/webp", 0.62);
    }
    if (optimizedDataUrl.length > 900000) {
        optimizedDataUrl = canvasToDataUrlGemini(canvas, "image/jpeg", 0.72);
    }

    return {
        dataUrl: optimizedDataUrl,
        width: targetWidth,
        height: targetHeight,
        mimeType: String(optimizedDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || "image/webp").trim()
    };
}

function sanitizeAttrGemini(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function insertarImagenEnEditorGemini(dataUrl, nombre = "imagen") {
    const safeName = sanitizeAttrGemini(nombre);
    const imageId = crearGeminiImageId();
    const html = `
        <figure class="cb-editor-image-wrap my-3">
            <img src="${dataUrl}" alt="${safeName}" data-gemini-image-id="${sanitizeAttrGemini(imageId)}" data-gemini-image-origin="clipboard" class="max-w-full h-auto rounded border border-slate-200" />
            <figcaption class="text-xs text-muted-foreground mt-1">${safeName}</figcaption>
        </figure>
    `;
    insertarHtmlEnEditorGemini(html);
}

async function manejarCambioImagenGemini(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
        if (!file.type.startsWith("image/")) {
            alert("Selecciona un archivo de imagen válido.");
            return;
        }

        const maxMB = 4;
        if (file.size > maxMB * 1024 * 1024) {
            alert(`La imagen supera ${maxMB}MB. Usa una imagen más ligera.`);
            return;
        }

        const optimized = await optimizarImagenGemini(file);
        const dataUrl = String(optimized?.dataUrl || "");
        if (!dataUrl.startsWith("data:image/")) {
            alert("No se pudo procesar la imagen.");
            return;
        }

        const editor = obtenerEditorGemini();
        if (!editor) return;
        editor.focus();
        restaurarSeleccionGemini();
        insertarImagenEnEditorGemini(dataUrl, file.name || "imagen");
        updateFormatInfo("Imagen insertada. Gemini la usará al generar.");
    } catch (error) {
        alert("No se pudo insertar la imagen.");
    } finally {
        if (input) input.value = "";
    }
}

async function manejarPegadoImagenGemini(file = null) {
    if (!(file instanceof File)) return false;
    if (!file.type.startsWith("image/")) return false;

    const maxMB = 4;
    if (file.size > maxMB * 1024 * 1024) {
        alert(`La imagen pegada supera ${maxMB}MB. Usa una imagen más ligera.`);
        return true;
    }

    const editor = obtenerEditorGemini();
    if (!editor) return false;

        const optimized = await optimizarImagenGemini(file);
        const dataUrl = String(optimized?.dataUrl || "");
        if (!dataUrl.startsWith("data:image/")) {
            throw new Error("No se pudo procesar la imagen pegada.");
        }

    editor.focus();
    restaurarSeleccionGemini();
    insertarImagenEnEditorGemini(dataUrl, file.name || "imagen pegada");
    updateFormatInfo("Imagen pegada. Gemini la usará al generar.");
    return true;
}

function insertGeminiImage() {
    const input = document.getElementById("inputImagenGemini");
    const editor = obtenerEditorGemini();
    if (!input || !editor) return;
    editor.focus();
    guardarSeleccionGemini();
    input.click();
}

function guardarSeleccionGemini() {
    const editor = obtenerEditorGemini();
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    currentGeminiSelection = range.cloneRange();
}

function restaurarSeleccionGemini() {
    if (!currentGeminiSelection) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(currentGeminiSelection);
    return true;
}

function inicializarToolbarInstruccionesGemini() {
    if (geminiToolbarInicializado) return;

    const editor = obtenerEditorGemini();
    const toolbar = document.getElementById('toolbarInstruccionesGemini');
    const imageInput = document.getElementById('inputImagenGemini');
    if (!editor || !toolbar) return;

    // Mantener selección al pulsar botones del toolbar.
    toolbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });

    editor.addEventListener('mouseup', guardarSeleccionGemini);
    editor.addEventListener('keyup', guardarSeleccionGemini);
    editor.addEventListener('input', guardarSeleccionGemini);

    // Mantener handlers globales mientras existan vistas legacy generadas dinámicamente.
    window.formatText = formatText;
    window.insertTable = insertTable;
    window.insertGeminiImage = insertGeminiImage;
    window.pasteAsPlainText = pasteAsPlainText;
    window.pasteWithFormat = pasteWithFormat;
    window.clearFormat = clearFormat;

    if (imageInput && imageInput.dataset.cbBound !== "1") {
        imageInput.addEventListener("change", manejarCambioImagenGemini);
        imageInput.dataset.cbBound = "1";
    }

    geminiToolbarInicializado = true;
}

// Función para formatear texto
function formatText(command) {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();

    // Aplicar formato
    document.execCommand(command, false, null);

    guardarSeleccionGemini();

    // Actualizar indicador
    updateFormatInfo(`Formato aplicado: ${command}`);
}

// Función para insertar una tabla básica
function insertTable() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();

    const tableHTML = `
        <table class="cb-editor-table">
            <thead>
                <tr>
                    <th class="cb-editor-table-th">Columna 1</th>
                    <th class="cb-editor-table-th">Columna 2</th>
                    <th class="cb-editor-table-th">Columna 3</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="cb-editor-table-td">Fila 1, Celda 1</td>
                    <td class="cb-editor-table-td">Fila 1, Celda 2</td>
                    <td class="cb-editor-table-td">Fila 1, Celda 3</td>
                </tr>
                <tr>
                    <td class="cb-editor-table-td">Fila 2, Celda 1</td>
                    <td class="cb-editor-table-td">Fila 2, Celda 2</td>
                    <td class="cb-editor-table-td">Fila 2, Celda 3</td>
                </tr>
            </tbody>
        </table>
    `;
    
    // Insertar tabla en la posición actual
    document.execCommand('insertHTML', false, tableHTML);
    guardarSeleccionGemini();
    
    // Actualizar indicador
    updateFormatInfo("Tabla insertada. Puedes editar su contenido.");
}

// Función para pegar como texto plano
function pasteAsPlainText() {
    const editor = obtenerEditorGemini();
    if (!editor) return;
    
    // Enfocar el editor
    editor.focus();
    restaurarSeleccionGemini();
    
    // Usar el comando paste (requiere permisos del navegador)
    try {
        document.execCommand('paste');
        guardarSeleccionGemini();
        updateFormatInfo("Texto pegado (sin formato)");
    } catch (e) {
        // Fallback: usar API de clipboard
        navigator.clipboard.readText().then(text => {
            document.execCommand('insertText', false, text);
            guardarSeleccionGemini();
            updateFormatInfo("Texto pegado (sin formato)");
        }).catch(err => {
            alert('No se pudo pegar el contenido. Por favor, usa Ctrl+V manualmente.');
        });
    }
}

// Función para pegar con formato HTML
async function pasteWithFormat() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();
    
    try {
        // Intentar obtener HTML del portapapeles
        const items = await navigator.clipboard.read();
        let htmlContent = null;
        
        for (const item of items) {
            if (item.types.includes('text/html')) {
                const blob = await item.getType('text/html');
                const text = await blob.text();
                htmlContent = text;
                break;
            }
        }
        
        if (htmlContent) {
            // Extraer solo el body si viene como HTML completo
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                htmlContent = bodyMatch[1];
            }
            htmlContent = prepararHtmlPegadoEnEditorGemini(htmlContent);

            if (contieneTablaEnHtml(htmlContent)) {
                insertarHtmlEnEditorGemini(htmlContent);
                updateFormatInfo("Tabla pegada desde portapapeles");
            } else {
                // Insertar el HTML normal
                document.execCommand('insertHTML', false, htmlContent);
                guardarSeleccionGemini();
                updateFormatInfo("Contenido pegado con formato HTML");
            }
        } else {
            // Fallback a texto plano
            const text = await navigator.clipboard.readText();
            if (esTextoTabular(text)) {
                const tableHTML = convertirTextoTabularATablaHTML(text);
                if (tableHTML) {
                    insertarHtmlEnEditorGemini(tableHTML);
                    updateFormatInfo("Tabla convertida desde texto del portapapeles");
                    return;
                }
            }
            document.execCommand('insertText', false, text);
            guardarSeleccionGemini();
            updateFormatInfo("Texto pegado (sin formato HTML disponible)");
        }
    } catch (error) {
        pasteAsPlainText();
    }
}

// Función para limpiar formato
function clearFormat() {
    const editor = obtenerEditorGemini();
    if (!editor) return;

    editor.focus();
    restaurarSeleccionGemini();
    document.execCommand('removeFormat', false, null);
    document.execCommand('unlink', false, null);
    guardarSeleccionGemini();
    updateFormatInfo("Formato limpiado");
}

// Función para actualizar información de formato
function updateFormatInfo(message) {
    const formatInfo = document.getElementById('formatInfo');
    const formatStatus = document.getElementById('formatStatus');
    
    if (formatInfo && formatStatus) {
        formatStatus.textContent = message;
        formatInfo.classList.remove('hidden');
        
        // Ocultar después de 3 segundos
        setTimeout(() => {
            formatInfo.classList.add('hidden');
        }, 3000);
    }
}

// Manejar el evento de pegado en el editor
document.addEventListener('DOMContentLoaded', function() {
    inicializarToolbarInstruccionesGemini();
    const editor = obtenerEditorGemini();
    
    if (editor) {
        // Manejar evento de pegado
        editor.addEventListener('paste', async function(e) {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

    const items = Array.from(clipboardData.items || []);
    const imageItems = items.filter((item) => String(item?.type || "").startsWith("image/"));
    const clipboardHtml = clipboardData.getData('text/html') || "";
    const clipboardText = clipboardData.getData('text/plain') || "";
    const htmlTieneImagenes = /<img\b/i.test(clipboardHtml) || /data:image\//i.test(clipboardHtml) || /<figure\b/i.test(clipboardHtml);
    if (imageItems.length > 0) {
                e.preventDefault();
                try {
                    editor.focus();
                    restaurarSeleccionGemini();

                    let contenidoPegado = false;

                    if (clipboardHtml) {
                        if (contieneTablaEnHtml(clipboardHtml)) {
                            let htmlContent = clipboardHtml;
                            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                            if (bodyMatch) htmlContent = bodyMatch[1];
                            htmlContent = prepararHtmlPegadoEnEditorGemini(htmlContent);
                            insertarHtmlEnEditorGemini(htmlContent);
                            contenidoPegado = true;
                        } else if (htmlTieneImagenes) {
                            let htmlContent = clipboardHtml;
                            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                            if (bodyMatch) htmlContent = bodyMatch[1];
                            htmlContent = prepararHtmlPegadoEnEditorGemini(htmlContent);
                            insertarHtmlEnEditorGemini(htmlContent);
                            contenidoPegado = true;
                        } else {
                            document.execCommand('insertHTML', false, clipboardHtml);
                            guardarSeleccionGemini();
                            contenidoPegado = true;
                        }
                    } else if (clipboardText && !esTextoTabular(clipboardText)) {
                        document.execCommand('insertText', false, clipboardText);
                        guardarSeleccionGemini();
                        contenidoPegado = true;
                    } else if (clipboardText && esTextoTabular(clipboardText)) {
                        const tableHTML = convertirTextoTabularATablaHTML(clipboardText);
                        if (tableHTML) {
                            insertarHtmlEnEditorGemini(tableHTML);
                            contenidoPegado = true;
                        }
                    }

                    // Si ya pegamos HTML o texto, no reinyectamos los archivos de imagen,
                    // porque algunos portapapeles exponen ambas formas del mismo contenido.
                    if (!contenidoPegado) {
                        for (const item of imageItems) {
                            const file = item.getAsFile?.() || null;
                            // eslint-disable-next-line no-await-in-loop
                            await manejarPegadoImagenGemini(file);
                        }
                    }
                    updateFormatInfo("Contenido multimodal pegado");
                } catch (_) {
                    alert("No se pudo procesar la imagen pegada.");
                }
                return;
            }

            const html = clipboardData.getData('text/html') || "";
            const text = clipboardData.getData('text/plain') || "";

            // 1) Si viene tabla HTML, pegar tabla manteniendo formato.
            if (html && contieneTablaEnHtml(html)) {
                e.preventDefault();
                let htmlContent = html;
                const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) htmlContent = bodyMatch[1];
                htmlContent = prepararHtmlPegadoEnEditorGemini(htmlContent);
                insertarHtmlEnEditorGemini(htmlContent);
                updateFormatInfo("Tabla pegada desde portapapeles");
                return;
            }

            // 2) Si viene texto tabular (Excel/Sheets TSV), convertir a tabla.
            if (text && esTextoTabular(text)) {
                e.preventDefault();
                const tableHTML = convertirTextoTabularATablaHTML(text);
                if (tableHTML) {
                    insertarHtmlEnEditorGemini(tableHTML);
                    updateFormatInfo("Tabla convertida desde Excel/Sheets");
                    return;
                }
            }

            // 3) Comportamiento normal para otros casos.
            setTimeout(() => {
                updateFormatInfo("Contenido pegado");
            }, 100);
        });
        
        // Manejar placeholder
        editor.addEventListener('focus', function() {
            if (this.innerHTML === '<br>' || this.innerHTML.trim() === '') {
                this.innerHTML = '';
            }
        });
        
        editor.addEventListener('blur', function() {
            if (this.innerHTML === '' || this.innerHTML === '<br>') {
                this.innerHTML = '';
            }
        });
    }
});

// Modificar la función abrirInstruccionesGemini para manejar HTML
window.abrirInstruccionesGemini = async function(moduloId) {
    inicializarToolbarInstruccionesGemini();
    const cursoIdModulo = String(curso?.id || "").trim() || null;
    let modulo = await obtenerModulo(moduloId, cursoIdModulo, { forceRefresh: true });
    if (!modulo) return;
    try {
        const repaired = await repararInstruccionesGeminiDeModulo(modulo, cursoIdModulo);
        modulo = repaired.modulo;
        if (repaired.changed) {
            await guardarModulo(moduloId, {
                instrucciones: modulo.instrucciones,
                instruccionesImagenes: modulo.instruccionesImagenes
            }, cursoIdModulo);
            sincronizarModuloLocal(moduloId, cursoIdModulo, {
                instrucciones: modulo.instrucciones,
                instruccionesImagenes: modulo.instruccionesImagenes
            });
        }
        if (Array.isArray(repaired.warnings) && repaired.warnings.length) {
            console.warn("Advertencias al reparar instrucciones Gemini:", repaired.warnings);
        }
    } catch (error) {
        console.warn("No se pudo reparar automáticamente el módulo al abrir instrucciones Gemini:", error);
    }

    // Guardamos referencia al ID, no el objeto
    window.__moduloEditandoInstruccionesId = moduloId;
    window.__moduloEditandoInstruccionesCursoId = String(modulo.cursoId || cursoIdModulo || "").trim();

    // Obtener el editor
    const editor = document.getElementById('txtModalInstruccionesGemini');
    const checkIncluirOriginal = document.getElementById('checkIncluirInstruccionOriginalModulo');
    const checkIncluirImagenOriginal = document.getElementById('checkIncluirImagenOriginalModulo');
    const checkGenerarGrafico = document.getElementById('checkGenerarGraficoModulo');
    const checkIgnorarContexto = document.getElementById('checkIgnorarContextoOtrosModulos');
    if (!editor) {
        return;
    }

    const legacyTemarioDefaults = new Set([
        `Genera un temario breve y claro para este subtema.
Debe funcionar como guía inicial y mapa de ruta.
Incluye título, breve introducción, puntos principales y orden sugerido de los contenidos.
No lo conviertas en lectura extensa, cuestionario ni actividad evaluativa.`,
        `Genera el temario de este subtema en una tabla clara.
Debe funcionar como guía inicial y mapa de ruta.
Organiza la información en columnas, por ejemplo: tema o CLIL, contenidos de lengua y funciones o desempeños.
Si las instrucciones están en inglés, responde en inglés; si están en español, responde en español.
No lo conviertas en lectura extensa, cuestionario ni actividad evaluativa.`
    ]);
    const instruccionesModulo = String(modulo.instrucciones || "").trim();
    const debeIgnorarDefaultTemario =
        normalizarTipoModulo(modulo.tipo) === "temario" &&
        legacyTemarioDefaults.has(instruccionesModulo);

    // Cargar instrucciones (pueden contener HTML)
    if (instruccionesModulo && !debeIgnorarDefaultTemario) {
        guardarImagenesGeminiPorModulo(moduloId, obtenerMapaImagenesGeminiDesdeModulo(modulo, moduloId));
        const htmlHidratado = hidratarHtmlInstruccionesGemini(modulo.instrucciones, moduloId, modulo.instruccionesImagenes);
        // Si contiene HTML, usarlo directamente
        if (modulo.instrucciones.includes('<') && modulo.instrucciones.includes('>')) {
            editor.innerHTML = sanitizarHtmlEditorial(htmlHidratado);
        } else {
            // Si es texto plano, convertirlo manteniendo saltos de línea
            const textWithBreaks = htmlHidratado.replace(/\n/g, '<br>');
            editor.innerHTML = sanitizarHtmlEditorial(textWithBreaks);
        }
    } else {
        editor.innerHTML = '';
    }

    if (checkIncluirOriginal) {
        checkIncluirOriginal.checked = modulo.incluirInstruccionOriginalEnPropuesta === true;
    }
    if (checkIncluirImagenOriginal) {
        checkIncluirImagenOriginal.checked = modulo.incluirImagenOriginalEnPropuesta === true;
    }
    if (checkGenerarGrafico) {
        checkGenerarGrafico.checked = modulo.generarGrafico === true;
    }
    if (checkIgnorarContexto) {
        checkIgnorarContexto.checked = modulo.ignorarContextoOtrosModulos === true;
    }

    // Mostrar modal
    document.getElementById("modalInstruccionesGemini").classList.remove("hidden");
    document.getElementById("modalInstruccionesGemini").classList.add("flex");
    
    // Enfocar el editor
    setTimeout(() => {
        editor.focus();
        guardarSeleccionGemini();
    }, 100);
};

function inicializarEventosModalInstruccionesGemini() {
    const btnCerrar = document.getElementById("btnCerrarInstruccionesGemini");
    const btnGuardar = document.getElementById("btnGuardarInstruccionesGemini");
    const modal = document.getElementById("modalInstruccionesGemini");
    const checkIncluirOriginal = document.getElementById("checkIncluirInstruccionOriginalModulo");
    const checkIncluirImagenOriginal = document.getElementById("checkIncluirImagenOriginalModulo");
    const checkGenerarGrafico = document.getElementById("checkGenerarGraficoModulo");
    const checkIgnorarContexto = document.getElementById("checkIgnorarContextoOtrosModulos");
    if (!btnCerrar || !btnGuardar || !modal) return;
    if (btnGuardar.dataset.cbBound === "1") return;

    const setGuardarBusy = (busy = false) => {
        btnGuardar.disabled = !!busy;
        btnGuardar.classList.toggle("is-loading", !!busy);
        btnGuardar.setAttribute("aria-busy", busy ? "true" : "false");
    };

    btnCerrar.addEventListener("click", () => {
        window.__moduloEditandoInstruccionesId = null;
        window.__moduloEditandoInstruccionesCursoId = null;
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    });

    // 🔥 SINCRONIZACIÓN EN TIEMPO REAL CON ESTADO LOCAL
    const sincronizarCamposGeminiLocal = () => {
        const editor = obtenerEditorGemini();
        if (!editor) return;
        const moduloId = window.__moduloEditandoInstruccionesId;
        const cursoIdModulo = String(window.__moduloEditandoInstruccionesCursoId || curso?.id || "").trim() || null;
        if (!moduloId) return;
        const docId = construirDocIdModulo(moduloId, cursoIdModulo);
        const moduloActual = (docId && modulosCache.get(docId)) || {};
        const instruccionesImagenes = sanitizarInstruccionesImagenes(moduloActual?.instruccionesImagenes || []);

        sincronizarModuloLocal(moduloId, cursoIdModulo, {
            instrucciones: normalizarHtmlInstruccionesGeminiParaEstadoLocal(editor.innerHTML, moduloId, instruccionesImagenes),
            instruccionesImagenes,
            incluirInstruccionOriginalEnPropuesta: checkIncluirOriginal?.checked === true,
            incluirImagenOriginalEnPropuesta: checkIncluirImagenOriginal?.checked === true,
            generarGrafico: checkGenerarGrafico?.checked === true,
            ignorarContextoOtrosModulos: checkIgnorarContexto?.checked === true
        });
    };

    const editor = obtenerEditorGemini();
    if (editor) {
        editor.addEventListener("input", sincronizarCamposGeminiLocal);
        editor.addEventListener("keyup", sincronizarCamposGeminiLocal);
        editor.addEventListener("blur", sincronizarCamposGeminiLocal);
    }
    [checkIncluirOriginal, checkIncluirImagenOriginal, checkGenerarGrafico, checkIgnorarContexto].forEach(chk => {
        if (chk) chk.addEventListener("change", sincronizarCamposGeminiLocal);
    });

    btnGuardar.addEventListener("click", async () => {
        const editor = obtenerEditorGemini();
        if (!editor) return;
        const moduloId = window.__moduloEditandoInstruccionesId;
        const cursoIdModulo = String(window.__moduloEditandoInstruccionesCursoId || curso?.id || "").trim() || null;
        if (!moduloId) return;
        setGuardarBusy(true);

        try {
            const htmlNormalizado = normalizarHtmlLegacyImagenGemini(editor.innerHTML.trim());
            if (htmlNormalizado !== editor.innerHTML.trim()) {
                editor.innerHTML = sanitizarHtmlEditorial(htmlNormalizado);
            }
            const prepared = await prepararHtmlInstruccionesGeminiParaGuardar(
                htmlNormalizado,
                moduloId,
                cursoIdModulo
            );
            const contenidoHTML = String(prepared?.html || "").trim();
            const payloadLocal = {
                instrucciones: contenidoHTML,
                instruccionesImagenes: sanitizarInstruccionesImagenes(prepared?.imagenes || []),
                incluirInstruccionOriginalEnPropuesta: checkIncluirOriginal?.checked === true,
                incluirImagenOriginalEnPropuesta: checkIncluirImagenOriginal?.checked === true,
                generarGrafico: checkGenerarGrafico?.checked === true,
                ignorarContextoOtrosModulos: checkIgnorarContexto?.checked === true
            };

            sincronizarModuloLocal(moduloId, cursoIdModulo, payloadLocal);
            await guardarModulo(moduloId, payloadLocal, cursoIdModulo);

            const docId = construirDocIdModulo(moduloId, cursoIdModulo);
            const docSnap = docId ? await getDoc(doc(db, "moodleCourses", docId)) : null;
            const instruccionesPersistidas = String(docSnap?.data()?.instrucciones || "").trim();
            const incluirOriginalPersistido = docSnap?.data()?.incluirInstruccionOriginalEnPropuesta === true;
            const incluirImagenOriginalPersistido = docSnap?.data()?.incluirImagenOriginalEnPropuesta === true;
            const generarGraficoPersistido = docSnap?.data()?.generarGrafico === true;
            const ignorarContextoPersistido = docSnap?.data()?.ignorarContextoOtrosModulos === true;
            const instruccionesImagenesPersistidas = JSON.stringify(sanitizarInstruccionesImagenes(docSnap?.data()?.instruccionesImagenes || []));
            const instruccionesImagenesEsperadas = JSON.stringify(payloadLocal.instruccionesImagenes);

            if (
                !docSnap?.exists() ||
                instruccionesPersistidas !== String(contenidoHTML || "").trim() ||
                instruccionesImagenesPersistidas !== instruccionesImagenesEsperadas ||
                incluirOriginalPersistido !== payloadLocal.incluirInstruccionOriginalEnPropuesta ||
                incluirImagenOriginalPersistido !== payloadLocal.incluirImagenOriginalEnPropuesta ||
                generarGraficoPersistido !== payloadLocal.generarGrafico ||
                ignorarContextoPersistido !== payloadLocal.ignorarContextoOtrosModulos
            ) {
                throw new Error("Las instrucciones o sus opciones no quedaron persistidas en Firebase.");
            }

            if (Array.isArray(prepared?.warnings) && prepared.warnings.length) {
                console.warn("Advertencias al guardar instrucciones Gemini:", prepared.warnings);
            }

            if (docId) {
                modulosCache.delete(docId);
                const moduloRefrescado = await obtenerModulo(moduloId, cursoIdModulo, { forceRefresh: true });
                if (moduloRefrescado) {
                    sincronizarModuloLocal(moduloId, cursoIdModulo, moduloRefrescado);
                }
            }

            window.__moduloEditandoInstruccionesId = null;
            window.__moduloEditandoInstruccionesCursoId = null;
            modal.classList.add("hidden");
            modal.classList.remove("flex");

            const hasTable = contenidoHTML.includes('<table') || contenidoHTML.includes('<tr') || contenidoHTML.includes('<td');
            const message = hasTable
                ? "✅ Instrucciones guardadas (incluyendo tablas)"
                : "✅ Instrucciones guardadas";

            mostrarNotificacion(message, 'success');
        } catch (error) {
            console.error("No se pudieron guardar las instrucciones de Gemini del módulo:", error);
            alert(`No se pudieron guardar las instrucciones del módulo.\n${error?.message || ""}`);
        } finally {
            setGuardarBusy(false);
        }
    });

    btnGuardar.dataset.cbBound = "1";
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        inicializarToolbarInstruccionesGemini();
        inicializarEventosModalInstruccionesGemini();
    });
} else {
    inicializarToolbarInstruccionesGemini();
    inicializarEventosModalInstruccionesGemini();
}



// === GESTIÓN DE CACHE EN DEPLOY ===

const APP_VERSION = "2026.04.13-02";

const storedVersion = localStorage.getItem("APP_VERSION");

if (storedVersion && storedVersion !== APP_VERSION) {
  localStorage.setItem("APP_VERSION", APP_VERSION);

  // Fuerza recarga real (equivalente a hard reload)
  window.location.reload(true);
} else {
  localStorage.setItem("APP_VERSION", APP_VERSION);
}
