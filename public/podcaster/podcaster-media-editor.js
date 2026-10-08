import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, updateDoc, getDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig } from "../js/firebase-web-config.js";
import { buildApiUrl, getAuthHeaders } from "../js/api-client-podcaster.js";
import { uploadPodcasterAsset } from "./podcaster-resumable-upload.js";
import { normalizeStylizedMotion, createStylizedImageMotionTimeline } from "./podcaster-stylized-motion.js";
import { getBundledLabelDataUrl, resolveBundledLabelSource } from "./podcaster-bundled-labels.js?rev=2026-10-07.editorial-labels-2";
import { getSelectedStylizedText, refreshStylizedTextGroup, detachSelectedStylizedLabel, attachStylizedLabel, countStylizedImageObjects } from "./podcaster-stylized-label-group.js";
import { setStylizedTextForScene } from "./podcaster-stylized-session.js";
import { resolveStylizedScenePreviewMedia } from "./podcaster-stylized-scene-media.js";
import { presentUnifiedToolModal } from "./podcaster-tool-modal-tabs.js?rev=2026-10-07.unified-tools-1";

let db;

function initFirebase() {
    try {
        const app = !getApps().length ? initializeApp(firebaseWebConfig) : getApp();
        db = getFirestore();
    } catch (e) {
        void e;
    }
}

let fabricCanvas = null;
const stylizedTextBitmapCache = new Map();

const STYLIZED_TEXT_STAGE_WIDTH = 1280;
const STYLIZED_TEXT_STAGE_HEIGHT = 720;
const LIGHT_TEXT_LABEL_TEMPLATES = new Set(['paper-png', 'blush-png', 'mint-png', 'sky-png']);
const VALID_CANVAS_TEXT_BASELINES = new Set([
    'top',
    'hanging',
    'middle',
    'alphabetic',
    'ideographic',
    'bottom'
]);
const STYLIZED_TEXT_ALLOWED_OBJECT_TYPES = new Set(['i-text', 'text', 'textbox', 'group', 'rect', 'image']);

function normalizeCanvasTextBaseline(value = '') {
    const baseline = String(value || '').trim().toLowerCase();
    if (!baseline) return value;
    if (baseline === 'alphabetical') return 'alphabetic';
    if (VALID_CANVAS_TEXT_BASELINES.has(baseline)) return baseline;
    return 'alphabetic';
}

function sanitizeStylizedTextRawString(raw = '') {
    if (typeof raw !== 'string' || !raw) return raw;
    return raw
        .replace(/("textBaseline"\s*:\s*")alphabetical(")/gi, '$1alphabetic$2')
        .replace(/(\\"textBaseline\\"\s*:\s*\\")alphabetical(\\")/gi, '$1alphabetic$2');
}

function sanitizeStylizedTextValue(value, currentKey = '') {
    if (currentKey === 'textBaseline') {
        return normalizeCanvasTextBaseline(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeStylizedTextValue(item, currentKey));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const nextValue = { ...value };
    Object.keys(nextValue).forEach((key) => {
        if (key === 'clipPath') {
            nextValue[key] = null;
            return;
        }
        nextValue[key] = sanitizeStylizedTextValue(nextValue[key], key);
    });
    if (Object.prototype.hasOwnProperty.call(nextValue, 'textBaseline')) {
        nextValue.textBaseline = normalizeCanvasTextBaseline(nextValue.textBaseline);
    }
    return nextValue;
}

function patchFabricTextBaselineDefaults() {
    if (typeof fabric === 'undefined' || !fabric || fabric.__podcasterTextBaselinePatched === true) return;
    [fabric.Text, fabric.IText, fabric.Textbox].filter(Boolean).forEach((Ctor) => {
        if (Ctor.prototype) {
            Ctor.prototype.textBaseline = normalizeCanvasTextBaseline(Ctor.prototype.textBaseline || 'alphabetic');
        }
        if (Ctor.ownDefaults && typeof Ctor.ownDefaults === 'object') {
            Ctor.ownDefaults.textBaseline = normalizeCanvasTextBaseline(Ctor.ownDefaults.textBaseline || 'alphabetic');
        }
    });
    fabric.__podcasterTextBaselinePatched = true;
}

function sanitizeFabricTextObjectInstance(obj = null) {
    if (!obj || typeof obj !== 'object') return;
    const type = String(obj.type || '').trim().toLowerCase();
    if (['i-text', 'text', 'textbox'].includes(type)) {
        const current = typeof obj.get === 'function' ? obj.get('textBaseline') : obj.textBaseline;
        const nextBaseline = normalizeCanvasTextBaseline(current || 'alphabetic');
        if (typeof obj.set === 'function') {
            obj.set('textBaseline', nextBaseline);
        } else {
            obj.textBaseline = nextBaseline;
        }
        if (obj.styles && typeof obj.styles === 'object') {
            obj.styles = sanitizeStylizedTextValue(obj.styles, 'styles');
        }
    }
    if (typeof obj.getObjects === 'function') {
        obj.getObjects().forEach((child) => sanitizeFabricTextObjectInstance(child));
    } else if (Array.isArray(obj.objects)) {
        obj.objects.forEach((child) => sanitizeFabricTextObjectInstance(child));
    }
}

function sanitizeFabricCanvasTextBaselines(canvas = null) {
    if (!canvas || typeof canvas.getObjects !== 'function') return;
    canvas.getObjects().forEach((obj) => sanitizeFabricTextObjectInstance(obj));
}

// --- DOM Elements ---
let els = {};

function initElements() {
    els = {
        textModal: document.getElementById('stylizedTextEditorModal'),
        textInput: document.getElementById('stylized-text-input'),
        textSize: document.getElementById('stylized-text-size'),
        labelSize: document.getElementById('stylized-text-label-size'),
        labelSizeValue: document.getElementById('stylized-text-label-size-value'),
        textFont: document.getElementById('stylized-text-font'),
        textColor: document.getElementById('stylized-text-color'),
        textColorLabel: document.getElementById('stylized-text-color-label'),
        textEffect: document.getElementById('stylized-text-effect'),
        alignBtns: document.querySelectorAll('.pme-btn-toggle[data-align]'),
        saveTextBtn: document.getElementById('saveStylizedTextBtn'),
        cancelTextBtn: document.getElementById('cancelStylizedTextBtn'),
        closeTextBtn: document.getElementById('closeStylizedTextEditorBtn'),
        deleteTextBtn: document.getElementById('deleteStylizedTextBtn'),
        addStylizedTextBtn: document.getElementById('addStylizedTextBtn')
    };
}

let currentEditingRowId = null;
let mediaEditorInitialized = false;
let stylizedMotion = normalizeStylizedMotion();
let stylizedMotionPreview = null;
let stylizedPreviewOverlay = null;
let stylizedMotionPreviewPlaying = false;
let stylizedPreviewEpoch = 0;

function syncStylizedMotionPreviewButton() {
    const button = els.textModal?.querySelector('#stylizedTextPreviewAnimationBtn');
    if (!button) return;
    button.innerHTML = stylizedMotionPreviewPlaying
        ? '<i class="fas fa-stop" aria-hidden="true"></i>'
        : '<i class="fas fa-play" aria-hidden="true"></i>';
    button.setAttribute('aria-label', stylizedMotionPreviewPlaying ? 'Detener animación' : 'Ver animación');
    button.title = stylizedMotionPreviewPlaying ? 'Detener animación' : 'Ver animación';
    button.setAttribute('aria-pressed', String(stylizedMotionPreviewPlaying));
}

function stopStylizedMotionPreview() {
    stylizedMotionPreviewPlaying = false;
    stylizedMotionPreview?.restore?.();
    stylizedMotionPreview = null;
    stylizedPreviewOverlay?.remove();
    stylizedPreviewOverlay = null;
    const canvasLayer = els.textModal?.querySelector('.pme-canvas-container .canvas-container');
    if (canvasLayer) canvasLayer.hidden = false;
    syncStylizedMotionPreviewButton();
}

function selectStylizedChoice(attribute, value) {
    els.textModal?.querySelectorAll(`[${attribute}]`).forEach((button) => {
        const active = button.getAttribute(attribute) === value;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function currentTextObject() {
    return getSelectedStylizedText(fabricCanvas);
}

function alignStylizedTextWithinLabel(text, align) {
    text.set('textAlign', align);
    const label = getSelectedStylizedLabelBackground();
    if (!label) return;

    const textCenter = text.getRelativeCenterPoint?.();
    const labelCenter = label.getRelativeCenterPoint?.();
    const textWidth = Number(text.getScaledWidth?.() || text.width || 0);
    const labelWidth = Number(label.getScaledWidth?.() || label.width || 0);
    if (!textCenter || !labelCenter || !textWidth || !labelWidth) return;

    const inset = Math.min(Math.max(18, labelWidth * 0.08), labelWidth * 0.3);
    const left = labelCenter.x - labelWidth / 2 + inset;
    const right = labelCenter.x + labelWidth / 2 - inset;
    const centerX = align === 'left'
        ? left + textWidth / 2
        : align === 'right'
            ? right - textWidth / 2
            : labelCenter.x;
    text.setPositionByOrigin(new fabric.Point(centerX, textCenter.y), 'center', 'center');
}

function initializeStylizedControlAccordions() {
    const modal = document.querySelector('#stylizedTextEditorModal');
    const panels = [...modal.querySelectorAll('.pme-sidebar, .pme-effects-panel')];
    panels.forEach((sidebar) => {
        if (sidebar.dataset.accordionsReady === 'true') return;
        sidebar.dataset.accordionsReady = 'true';
        [...sidebar.querySelectorAll(':scope > .pme-control-group')].forEach((group, index) => {
            const label = group.querySelector(':scope > label');
            if (!label) return;
            const details = document.createElement('details');
            details.className = 'pme-control-group pme-accordion';
            details.open = index === 0;
            const summary = document.createElement('summary');
            summary.className = 'pme-accordion-summary';
            summary.append(label);
            const body = document.createElement('div');
            body.className = 'pme-accordion-body';
            while (group.firstChild) body.append(group.firstChild);
            details.append(summary, body);
            group.replaceWith(details);
            details.addEventListener('toggle', () => {
                if (!details.open) return;
                sidebar.querySelectorAll(':scope > .pme-accordion[open]').forEach((other) => {
                    if (other !== details) other.open = false;
                });
            });
        });
    });
}

function initializeStylizedEditorLayout() {
    const modal = document.querySelector('#stylizedTextEditorModal');
    const body = modal?.querySelector('.pme-modal-body');
    const sidebar = body?.querySelector('.pme-sidebar');
    const preview = body?.querySelector('.pme-preview-pane');
    if (!body || !sidebar || !preview || body.dataset.layoutReady === 'true') return;
    body.dataset.layoutReady = 'true';
    const effects = document.createElement('aside');
    effects.className = 'pme-effects-panel';
    effects.setAttribute('aria-label', 'Efectos, etiquetas y animación');
    const previewColumn = document.createElement('div');
    previewColumn.className = 'pme-preview-column';
    const timeGroup = sidebar.querySelector(':scope > .pme-timing-group');
    for (const group of [...sidebar.querySelectorAll(':scope > .pme-control-group, :scope > .pme-timing-group')]) {
        const title = group.querySelector(':scope > label')?.textContent.toLowerCase() || '';
        if (group !== timeGroup && (title.includes('efecto visual') || title.includes('etiqueta de fondo') || title.includes('animación'))) {
            effects.append(group);
        }
    }
    preview.before(previewColumn);
    const player = preview.querySelector('.pme-preview-actions');
    previewColumn.append(preview);
    if (player) previewColumn.append(player);
    const labelSizeControl = effects.querySelector('.pme-label-size-control');
    if (timeGroup) {
        timeGroup.classList.add('snoopy-scene-time');
        previewColumn.append(timeGroup);
    }
    if (labelSizeControl) {
        labelSizeControl.classList.add('snoopy-size-control');
        previewColumn.append(labelSizeControl);
    }
    player?.classList.add('snoopy-preview-player');
    body.append(effects);
}

function activeSceneDurationSec() {
    const row = window.PodcasterState?.activeSession?.script?.rows?.find((item) => String(item?.id) === currentEditingRowId);
    return Math.max(0.5, Number(row?.durationSec || 8) || 8);
}

function syncStylizedTimingControls(startSec = 0, visibleSec = activeSceneDurationSec()) {
    const start = els.textModal?.querySelector('#stylized-text-start-sec');
    const end = els.textModal?.querySelector('#stylized-text-visible-sec');
    if (!start || !end) return;
    const sceneDuration = activeSceneDurationSec();
    const durationLabel = els.textModal?.querySelector('[data-stylized-scene-duration]');
    if (durationLabel) durationLabel.textContent = `${sceneDuration.toFixed(1)} s`;
    start.min = '0'; start.max = String(Math.max(0, sceneDuration - 0.5));
    end.min = String(Number(startSec) + 0.5); end.max = String(sceneDuration);
    const safeStart = Math.min(Math.max(0, Number(startSec) || 0), Number(start.max));
    const safeEnd = Math.min(sceneDuration, Math.max(safeStart + 0.5, safeStart + (Number(visibleSec) || sceneDuration)));
    start.value = String(safeStart); end.min = String(safeStart + 0.5); end.value = String(safeEnd);
    const range = els.textModal.querySelector('[data-pme-dual-range]');
    if (range) {
        range.style.setProperty('--range-start', `${safeStart / sceneDuration * 100}%`);
        range.style.setProperty('--range-end', `${safeEnd / sceneDuration * 100}%`);
    }
    els.textModal.querySelector('#stylized-text-start-sec-value').textContent = `${Number(start.value).toFixed(1)} s`;
    els.textModal.querySelector('#stylized-text-visible-sec-value').textContent = `${Number(end.value).toFixed(1)} s`;
}

function syncStylizedFormatControls() {
    const selected = currentTextObject();
    els.textModal?.querySelectorAll('[data-text-format]').forEach((button) => {
        const format = button.dataset.textFormat;
        const active = format === 'bold' ? selected?.fontWeight === 'bold' : format === 'italic' ? selected?.fontStyle === 'italic' : Boolean(selected?.underline);
        button.classList.toggle('is-active', Boolean(active));
        button.setAttribute('aria-pressed', String(Boolean(active)));
    });
}

function syncStylizedDeleteControl() {
    const button = els.textModal?.querySelector('#stylizedTextDeleteElementBtn');
    const selected = fabricCanvas?.getActiveObject?.();
    if (!button || !selected) { if (button) { button.hidden = true; button.classList.remove('is-element-hovered'); } return; }
    const rect = selected.getBoundingRect(true, true);
    const stage = els.textModal.querySelector('.pme-canvas-container');
    const style = getComputedStyle(stage);
    const scaleX = Number(style.getPropertyValue('--pme-canvas-scale-x')) || 1;
    const scaleY = Number(style.getPropertyValue('--pme-canvas-scale-y')) || 1;
    button.style.left = `${stage.clientWidth / 2 + (rect.left + rect.width - 640) * scaleX}px`;
    button.style.top = `${stage.clientHeight / 2 + (rect.top - 360) * scaleY}px`;
    button.hidden = false;
}

function clearStylizedLabelBackground() {
    const text = detachSelectedStylizedLabel(fabricCanvas);
    // Legacy sessions stored their label as a separate canvas object.
    if (text) fabricCanvas?.getObjects?.().filter((item) => item.assetRole === 'label-background').forEach((item) => fabricCanvas.remove(item));
    return text;
}

function getSelectedStylizedLabelBackground() {
    const active = fabricCanvas?.getActiveObject?.();
    if (active?.assetRole === 'label-background') return active;
    const group = active?.assetRole === 'label-group' ? active : currentTextObject()?.group;
    return group?.assetRole === 'label-group'
        ? group.getObjects?.().find((item) => item?.assetRole === 'label-background') || null
        : null;
}

function syncStylizedLabelSizeControl() {
    const input = els.labelSize;
    if (!input) return;
    const label = getSelectedStylizedLabelBackground();
    const percent = label ? Math.round(Math.max(0.5, Math.min(2, Number(label.labelScale) || 1)) * 100) : 100;
    input.value = String(percent);
    input.disabled = !label;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, ((percent - min) / Math.max(1, max - min)) * 100))}%`);
    if (els.labelSizeValue) els.labelSizeValue.textContent = `${percent}%`;
}

function resizeSelectedStylizedLabel(value) {
    const label = getSelectedStylizedLabelBackground();
    if (!label) return;
    const group = label.group?.assetRole === 'label-group' ? label.group : null;
    const nextScale = Math.max(0.5, Math.min(2, Number(value) / 100 || 1));
    const previousScale = Math.max(0.5, Math.min(2, Number(label.labelScale) || 1));
    const text = currentTextObject();
    const getLocalCenter = (object) => {
        const width = Number(object.width || 0) * Number(object.scaleX || 1);
        const height = Number(object.height || 0) * Number(object.scaleY || 1);
        const originX = object.originX || 'left';
        const originY = object.originY || 'top';
        const x = Number(object.left || 0) + (originX === 'left' ? width / 2 : originX === 'right' ? -width / 2 : 0);
        const y = Number(object.top || 0) + (originY === 'top' ? height / 2 : originY === 'bottom' ? -height / 2 : 0);
        return { x, y };
    };
    const anchor = group && text?.group === group ? getLocalCenter(text) : getLocalCenter(label);
    label.set({
        scaleX: Number(label.scaleX || 1) * nextScale / previousScale,
        scaleY: Number(label.scaleY || 1) * nextScale / previousScale,
        labelScale: nextScale
    });
    const width = Number(label.width || 0) * Number(label.scaleX || 1);
    const height = Number(label.height || 0) * Number(label.scaleY || 1);
    const originX = label.originX || 'left';
    const originY = label.originY || 'top';
    label.set({
        left: anchor.x + (originX === 'left' ? -width / 2 : originX === 'right' ? width / 2 : 0),
        top: anchor.y + (originY === 'top' ? -height / 2 : originY === 'bottom' ? height / 2 : 0)
    });
    label.setCoords?.();
    if (group) {
        group.addWithUpdate();
        group.setCoords?.();
    }
    fabricCanvas.requestRenderAll();
    syncStylizedLabelSizeControl();
}

function applyStylizedLabelTemplate(template = 'none') {
    if (!fabricCanvas) return;
    if (template.endsWith('-png')) {
        void addBundledStylizedLabel(template).catch(() => {
            const status = document.getElementById('stylizedTextEditorStatus');
            if (status) status.textContent = 'No se pudo cargar la etiqueta PNG.';
        });
        return;
    }
    stopStylizedMotionPreview();
    const textObject = clearStylizedLabelBackground();
    if (template !== 'none' && textObject) {
        const box = textObject.getBoundingRect(true, true);
        const padX = Math.max(24, textObject.fontSize * 0.35);
        const padY = Math.max(14, textObject.fontSize * 0.18);
        const accent = getComputedStyle(els.textModal).getPropertyValue('--pme-primary').trim() || '#60a5fa';
        const rect = new fabric.Rect({
            left: box.left - padX,
            top: box.top - padY,
            width: box.width + padX * 2,
            height: box.height + padY * 2,
            rx: template === 'accent' ? 4 : 18,
            ry: template === 'accent' ? 4 : 18,
            fill: template === 'glass' ? 'rgba(25,35,52,0.66)' : template === 'accent' ? 'rgba(16,24,40,0.78)' : accent,
            stroke: template === 'glass' ? 'rgba(255,255,255,0.42)' : template === 'accent' ? accent : 'transparent',
            strokeWidth: template === 'glass' ? 2 : template === 'accent' ? 3 : 0,
            opacity: template === 'solid' ? 0.9 : 1,
            assetRole: 'label-background',
            labelTemplate: template,
            labelScale: 1
        });
        attachStylizedLabel(fabricCanvas, fabric, rect, textObject);
    }
    selectStylizedChoice('data-label-template', template);
    fabricCanvas.renderAll();
}

async function addBundledStylizedLabel(template) {
    const path = `/podcaster/assets/text-labels/${template}.png?v=2026-10-07.editorial-labels-2`;
    const image = await loadFabricImage(getBundledLabelDataUrl(template) || path);
    const text = clearStylizedLabelBackground();
    if (text && LIGHT_TEXT_LABEL_TEMPLATES.has(template)) {
        text.set('fill', '#172554');
        refreshStylizedTextGroup(text, fabricCanvas);
    }
    const box = text?.getBoundingRect(true, true) || { left: 350, top: 400, width: 580, height: 110 };
    const width = Math.max(230, box.width + 110);
    const height = Math.max(80, box.height + 54);
    image.set({ left: box.left - 55, top: box.top - 27,
        scaleX: width / Math.max(1, image.width), scaleY: height / Math.max(1, image.height),
        assetRole: 'label-background', labelTemplate: template, labelScale: 1, crossOrigin: 'anonymous' });
    if (text) attachStylizedLabel(fabricCanvas, fabric, image, text);
    else { fabricCanvas.add(image); fabricCanvas.setActiveObject(image); }
    fabricCanvas.renderAll();
    syncTextUI();
    syncStylizedLabelSizeControl();
    selectStylizedChoice('data-label-template', template);
}

function loadFabricImage(url = '') {
    return new Promise((resolve, reject) => {
        fabric.Image.fromURL(url, (image) => image ? resolve(image) : reject(new Error('No se pudo abrir el PNG.')), { crossOrigin: 'anonymous' });
    });
}

async function uploadStylizedBackground(file) {
    const status = document.getElementById('stylizedTextEditorStatus');
    if (!file || file.type !== 'image/png' || file.size > 10 * 1024 * 1024) throw new Error('Selecciona un PNG de hasta 10 MB.');
    const session = window.PodcasterState?.activeSession;
    if (!session?.id || !currentEditingRowId) throw new Error('Selecciona una escena guardada.');
    if (status) status.textContent = 'Cargando PNG…';
    const result = await uploadPodcasterAsset(file, { kind: 'scene-image', sessionId: session.id, rowId: currentEditingRowId });
    if (!result?.media?.storagePath || !result.media.downloadUrl) throw new Error('No se recibió el PNG guardado.');
    const image = await loadFabricImage(result.media.downloadUrl);
    stopStylizedMotionPreview();
    const text = clearStylizedLabelBackground();
    const box = text?.getBoundingRect(true, true) || { left: 350, top: 400, width: 580, height: 110 };
    const width = Math.max(160, box.width + 80);
    const height = Math.max(60, box.height + 40);
    image.set({
        left: box.left - 40, top: box.top - 20,
        scaleX: width / Math.max(1, image.width),
        scaleY: height / Math.max(1, image.height),
        assetRole: 'label-background',
        assetStoragePath: result.media.storagePath,
        labelTemplate: 'png',
        labelScale: 1
    });
    if (text) attachStylizedLabel(fabricCanvas, fabric, image, text);
    else { fabricCanvas.add(image); fabricCanvas.setActiveObject(image); }
    fabricCanvas.renderAll();
    selectStylizedChoice('data-label-template', 'png');
    if (status) status.textContent = text ? 'PNG anclado al texto. Muévelos juntos en el lienzo.' : 'PNG guardado. Añade texto para crear una etiqueta.';
}



function parseStylizedTextSceneData(raw = null) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(sanitizeStylizedTextRawString(raw));
        } catch (error) {
            void error;
            return null;
        }
    }
    return raw && typeof raw === 'object' ? raw : null;
}

function sanitizeStylizedTextSceneData(raw = null) {
    const parsed = parseStylizedTextSceneData(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const safe = {
        ...parsed,
        background: '',
        backgroundColor: '',
        overlayColor: '',
        clipPath: null
    };

    const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
    safe.objects = objects
        .filter((item) => item && STYLIZED_TEXT_ALLOWED_OBJECT_TYPES.has(String(item.type || '').trim().toLowerCase()))
        .map((item) => sanitizeStylizedTextObject(item))
        .filter(Boolean);

    return safe;
}

// Las etiquetas creadas en desarrollo quedaron serializadas con src absoluto
// (http://127.0.0.1:<puerto>/...). En producción eso rompe mixed-content/CSP,
// así que se reescriben al data URL embebido o a la ruta relativa del origen.
function rewriteStylizedLabelImageSrc(object = null) {
    if (!object || typeof object !== 'object') return object;
    if (String(object.type || '').trim().toLowerCase() !== 'image') return object;
    const src = String(object.src || '').trim();
    if (!src) return object;
    const bundled = resolveBundledLabelSource(src, object.labelTemplate || '');
    if (bundled) return { ...object, src: bundled };
    try {
        const url = new URL(src, window.location.origin);
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') {
            return { ...object, src: `${url.pathname}${url.search}` };
        }
    } catch (_) { /* src relativo o no parseable: se deja igual */ }
    return object;
}

function sanitizeStylizedTextObject(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    const next = sanitizeStylizedTextValue(raw) || null;
    if (!next || typeof next !== 'object') return null;
    next.backgroundColor = '';
    next.overlayFill = '';
    next.clipPath = null;

    if (Array.isArray(raw.objects)) {
        next.objects = raw.objects.map((item) => sanitizeStylizedTextObject(item)).filter(Boolean);
    }
    return rewriteStylizedLabelImageSrc(next);
}

function cloneStylizedTextData(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    try {
        return JSON.parse(JSON.stringify(raw));
    } catch (_) {
        return null;
    }
}

function scaleStylizedShadow(shadow = null, scaleX = 1, scaleY = 1) {
    if (!shadow || typeof shadow !== 'object') return shadow;
    const blurScale = (scaleX + scaleY) / 2;
    return {
        ...shadow,
        blur: Number.isFinite(Number(shadow.blur)) ? Number(shadow.blur) * blurScale : shadow.blur,
        offsetX: Number.isFinite(Number(shadow.offsetX)) ? Number(shadow.offsetX) * scaleX : shadow.offsetX,
        offsetY: Number.isFinite(Number(shadow.offsetY)) ? Number(shadow.offsetY) * scaleY : shadow.offsetY
    };
}

function scaleStylizedTextObject(raw = null, scaleX = 1, scaleY = 1) {
    if (!raw || typeof raw !== 'object') return raw;
    const next = { ...raw };
    if (Number.isFinite(Number(next.left))) next.left = Number(next.left) * scaleX;
    if (Number.isFinite(Number(next.top))) next.top = Number(next.top) * scaleY;
    if (Number.isFinite(Number(next.scaleX))) next.scaleX = Number(next.scaleX) * scaleX;
    if (Number.isFinite(Number(next.scaleY))) next.scaleY = Number(next.scaleY) * scaleY;
    if (next.shadow) next.shadow = scaleStylizedShadow(next.shadow, scaleX, scaleY);
    if (Array.isArray(next.objects)) {
        next.objects = next.objects.map((item) => scaleStylizedTextObject(item, scaleX, scaleY));
    }
    return next;
}

function transformStylizedTextSceneData(raw = null, fromWidth = STYLIZED_TEXT_STAGE_WIDTH, fromHeight = STYLIZED_TEXT_STAGE_HEIGHT, toWidth = STYLIZED_TEXT_STAGE_WIDTH, toHeight = STYLIZED_TEXT_STAGE_HEIGHT) {
    const sanitized = sanitizeStylizedTextSceneData(raw);
    const cloned = cloneStylizedTextData(sanitized);
    if (!cloned) return null;
    const sourceWidth = Math.max(1, Number(fromWidth || cloned.width || STYLIZED_TEXT_STAGE_WIDTH) || STYLIZED_TEXT_STAGE_WIDTH);
    const sourceHeight = Math.max(1, Number(fromHeight || cloned.height || STYLIZED_TEXT_STAGE_HEIGHT) || STYLIZED_TEXT_STAGE_HEIGHT);
    const targetWidth = Math.max(1, Number(toWidth || STYLIZED_TEXT_STAGE_WIDTH) || STYLIZED_TEXT_STAGE_WIDTH);
    const targetHeight = Math.max(1, Number(toHeight || STYLIZED_TEXT_STAGE_HEIGHT) || STYLIZED_TEXT_STAGE_HEIGHT);
    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;
    cloned.width = targetWidth;
    cloned.height = targetHeight;
    cloned.objects = Array.isArray(cloned.objects)
        ? cloned.objects.map((item) => scaleStylizedTextObject(item, scaleX, scaleY)).filter(Boolean)
        : [];
    return cloned;
}

function fitFabricCanvasToEditorContainer() {
    if (!fabricCanvas) return { width: STYLIZED_TEXT_STAGE_WIDTH, height: STYLIZED_TEXT_STAGE_HEIGHT };
    const container = document.querySelector('.pme-canvas-container');
    const montageRect = document.querySelector('#podcastVideoStage .podcast-video-preview')?.getBoundingClientRect?.();
    if (container && montageRect?.width > 0 && montageRect?.height > 0) {
        container.style.aspectRatio = `${montageRect.width} / ${montageRect.height}`;
        container.classList.toggle('is-portrait-preview', montageRect.height > montageRect.width);
    }
    const containerWidth = Math.max(1, Math.round(Number(container?.clientWidth || 0) || 0) || 960);
    const containerHeight = Math.max(1, Math.round(Number(container?.clientHeight || 0) || 0) || 540);
    if (container) {
        container.style.setProperty('--pme-canvas-scale-x', String(containerWidth / STYLIZED_TEXT_STAGE_WIDTH));
        container.style.setProperty('--pme-canvas-scale-y', String(containerHeight / STYLIZED_TEXT_STAGE_HEIGHT));
        container.style.setProperty('--pme-stage-width', `${STYLIZED_TEXT_STAGE_WIDTH}px`);
        container.style.setProperty('--pme-stage-height', `${STYLIZED_TEXT_STAGE_HEIGHT}px`);
    }
    fabricCanvas.setDimensions({ width: STYLIZED_TEXT_STAGE_WIDTH, height: STYLIZED_TEXT_STAGE_HEIGHT });
    fabricCanvas.setBackgroundColor('transparent', fabricCanvas.renderAll.bind(fabricCanvas));
    return { width: STYLIZED_TEXT_STAGE_WIDTH, height: STYLIZED_TEXT_STAGE_HEIGHT };
}

function resolveStylizedTextRenderBox(container = null) {
    const host = container || null;
    if (!host) {
        return { width: STYLIZED_TEXT_STAGE_WIDTH, height: STYLIZED_TEXT_STAGE_HEIGHT, left: 0, top: 0 };
    }
    const hostRect = host.getBoundingClientRect?.() || null;
    const scope = host.parentElement || host;
    const preferredSelectors = [
        '#podcastActiveSpeakerVideo',
        '#podcastActiveSpeakerImage',
        '#podcastActiveSpeakerVideoAlt',
        '#podcastActiveSpeakerImageAlt',
        '#montageExportPreviewVideo',
        '#montageExportPreviewImage',
        '#montageExportPreviewVideoAlt',
        '#montageExportPreviewImageAlt'
    ];
    const mediaCandidates = preferredSelectors
        .map((selector) => scope.querySelector(selector))
        .filter((node) => {
            if (!node || node.hidden) return false;
            const rect = node.getBoundingClientRect?.();
            return Boolean(rect && rect.width > 1 && rect.height > 1);
        });
    const media = mediaCandidates[0] || null;
    if (media && hostRect) {
        const mediaRect = media.getBoundingClientRect();
        return {
            width: Math.max(1, Math.round(mediaRect.width)),
            height: Math.max(1, Math.round(mediaRect.height)),
            left: Math.round(mediaRect.left - hostRect.left),
            top: Math.round(mediaRect.top - hostRect.top)
        };
    }
    return {
        width: Math.max(1, Math.round(Number(host.clientWidth || STYLIZED_TEXT_STAGE_WIDTH) || STYLIZED_TEXT_STAGE_WIDTH)),
        height: Math.max(1, Math.round(Number(host.clientHeight || STYLIZED_TEXT_STAGE_HEIGHT) || STYLIZED_TEXT_STAGE_HEIGHT)),
        left: 0,
        top: 0
    };
}

function clearStylizedScenePreviewMedia() {
    stylizedPreviewEpoch += 1;
    const container = document.querySelector('.pme-canvas-container');
    if (!container) return;
    container.querySelectorAll('.pme-scene-preview-media').forEach((node) => {
        if (node.tagName === 'VIDEO') {
            try { node.pause(); } catch (_) { }
            try { node.removeAttribute('src'); } catch (_) { }
            try { node.load(); } catch (_) { }
        }
        node.remove();
    });
}

async function syncStylizedScenePreviewMedia(session = null, rowId = '') {
    const container = document.querySelector('.pme-canvas-container');
    if (!container) return;
    clearStylizedScenePreviewMedia();
    const requestEpoch = stylizedPreviewEpoch;
    const asset = resolveStylizedScenePreviewMedia(session, rowId);
    if (!asset?.src) return;

    let resolvedSrc = asset.src;
    if (asset.kind === 'image' && typeof window.PodcasterUI?.resolveStageImageSource === 'function') {
        try { resolvedSrc = String(await window.PodcasterUI.resolveStageImageSource(asset.src) || '').trim(); }
        catch (_) { return; }
    }
    if (!resolvedSrc || requestEpoch !== stylizedPreviewEpoch || els.textModal?.hidden) return;

    const mediaEl = document.createElement(asset.kind === 'image' ? 'img' : 'video');
    mediaEl.className = 'pme-scene-preview-media';
    mediaEl.setAttribute('aria-hidden', 'true');
    mediaEl.src = resolvedSrc;

    if (asset.kind === 'image') {
        mediaEl.alt = '';
        mediaEl.loading = 'eager';
        mediaEl.decoding = 'async';
    } else {
        mediaEl.muted = true;
        mediaEl.defaultMuted = true;
        mediaEl.loop = true;
        mediaEl.autoplay = true;
        mediaEl.playsInline = true;
        mediaEl.preload = 'metadata';
        mediaEl.setAttribute('playsinline', '');
        mediaEl.addEventListener('loadeddata', () => {
            mediaEl.play().catch(() => {});
        }, { once: true });
    }

    container.prepend(mediaEl);
}

function buildStylizedTextBitmapCacheKey(textData = null) {
    return textData ? JSON.stringify(textData) : '';
}

function invalidateStylizedTextBitmapCache(textData = null) {
    if (!textData) {
        stylizedTextBitmapCache.clear();
        return;
    }
    const sanitizedTextData = sanitizeStylizedTextSceneData(textData);
    const cacheKey = buildStylizedTextBitmapCacheKey(sanitizedTextData);
    if (cacheKey) stylizedTextBitmapCache.delete(cacheKey);
}

async function renderStylizedTextToDataUrl(textData = null) {
    const sanitizedTextData = sanitizeStylizedTextSceneData(textData);
    const cacheKey = buildStylizedTextBitmapCacheKey(sanitizedTextData);
    if (!cacheKey) return '';
    if (stylizedTextBitmapCache.has(cacheKey)) {
        return stylizedTextBitmapCache.get(cacheKey) || '';
    }
    await document.fonts?.ready;
    return new Promise((resolve, reject) => {
        patchFabricTextBaselineDefaults();
        const canvasEl = document.createElement('canvas');
        canvasEl.width = STYLIZED_TEXT_STAGE_WIDTH;
        canvasEl.height = STYLIZED_TEXT_STAGE_HEIGHT;
        const staticCanvas = new fabric.StaticCanvas(canvasEl, {
            width: STYLIZED_TEXT_STAGE_WIDTH,
            height: STYLIZED_TEXT_STAGE_HEIGHT,
            backgroundColor: 'transparent',
            renderOnAddRemove: false
        });
        let completed = false;
        const timer = setTimeout(() => {
            if (completed) return;
            completed = true;
            staticCanvas.dispose?.();
            reject(new Error('No se pudo cargar un recurso del texto estilizado en 15 segundos.'));
        }, 15000);
        staticCanvas.loadFromJSON(sanitizedTextData, () => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            const expectedImages = countStylizedImageObjects(sanitizedTextData.objects);
            const loadedImages = countStylizedImageObjects(staticCanvas.toJSON().objects);
            if (loadedImages < expectedImages) {
                staticCanvas.dispose?.();
                reject(new Error('Falta un PNG de la etiqueta. Revisa el recurso en Storage antes de exportar.'));
                return;
            }
            sanitizeFabricCanvasTextBaselines(staticCanvas);
            staticCanvas.setBackgroundColor('transparent', staticCanvas.renderAll.bind(staticCanvas));
            staticCanvas.renderAll();
            const dataUrl = canvasEl.toDataURL('image/png');
            stylizedTextBitmapCache.set(cacheKey, dataUrl);
            if (typeof staticCanvas.dispose === 'function') staticCanvas.dispose();
            resolve(dataUrl);
        });
    });
}

// --- Stylized Text logic (Fabric.js) ---
function initFabric() {
    if (fabricCanvas) return;
    patchFabricTextBaselineDefaults();

    fabricCanvas = new fabric.Canvas('stylized-text-fabric-canvas', {
        width: STYLIZED_TEXT_STAGE_WIDTH,
        height: STYLIZED_TEXT_STAGE_HEIGHT,
        backgroundColor: 'transparent'
    });
    if (fabricCanvas.lowerCanvasEl) {
        fabricCanvas.lowerCanvasEl.style.background = 'transparent';
    }
    if (fabricCanvas.upperCanvasEl) {
        fabricCanvas.upperCanvasEl.style.background = 'transparent';
    }

    els.textInput.addEventListener('input', (e) => {
        const activeObj = currentTextObject();
        if (activeObj) {
            activeObj.set('text', e.target.value);
            refreshStylizedTextGroup(activeObj, fabricCanvas);
        }
    });

    els.textSize?.addEventListener('input', (event) => {
        const activeObj = currentTextObject();
        if (!activeObj) return;
        const desiredSize = Math.max(8, Math.min(300, Number(event.target.value) || 54));
        const objectScaleY = Math.max(0.01, Math.abs(Number(activeObj.getObjectScaling?.().y || activeObj.scaleY || 1)));
        activeObj.set('fontSize', desiredSize / objectScaleY);
        refreshStylizedTextGroup(activeObj, fabricCanvas);
        fabricCanvas.requestRenderAll();
    });

    els.textFont.addEventListener('change', (e) => {
        const activeObj = currentTextObject();
        if (activeObj) {
            activeObj.set('fontFamily', e.target.value);
            refreshStylizedTextGroup(activeObj, fabricCanvas);
        }
    });

    els.textColor.addEventListener('input', (e) => {
        const activeObj = currentTextObject();
        const color = e.target.value.toUpperCase();
        if (els.textColorLabel) els.textColorLabel.textContent = color;
        
        if (activeObj) {
            activeObj.set('fill', color);
            refreshStylizedTextGroup(activeObj, fabricCanvas);
        }
    });

    els.alignBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const align = btn.dataset.align;
            const activeObj = currentTextObject();
            
            els.alignBtns.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            if (activeObj) {
                alignStylizedTextWithinLabel(activeObj, align);
                refreshStylizedTextGroup(activeObj, fabricCanvas);
                syncTextUI();
            }
        });
    });

    els.textEffect.addEventListener('change', (e) => {
        applyTextEffect(e.target.value);
    });
    els.textModal.querySelectorAll('[data-text-effect]').forEach((button) => button.addEventListener('click', () => {
        els.textEffect.value = button.dataset.textEffect || 'none';
        applyTextEffect(els.textEffect.value);
        selectStylizedChoice('data-text-effect', els.textEffect.value);
    }));
    els.textModal.querySelectorAll('[data-label-template]').forEach((button) => button.addEventListener('click', () => {
        applyStylizedLabelTemplate(button.dataset.labelTemplate || 'none');
    }));
    els.labelSize?.addEventListener('input', (event) => resizeSelectedStylizedLabel(event.target.value));
    els.textModal.querySelector('#stylized-text-background-file')?.addEventListener('change', async (event) => {
        const status = document.getElementById('stylizedTextEditorStatus');
        try { await uploadStylizedBackground(event.target.files?.[0]); }
        catch (error) { if (status) status.textContent = String(error?.message || 'No se pudo cargar el PNG.'); }
        event.target.value = '';
    });
    els.textModal.querySelectorAll('[data-text-animation]').forEach((button) => button.addEventListener('click', () => {
        stopStylizedMotionPreview();
        stylizedMotion = normalizeStylizedMotion({ ...stylizedMotion, preset: button.dataset.textAnimation });
        selectStylizedChoice('data-text-animation', stylizedMotion.preset);
    }));
    const durationInput = els.textModal.querySelector('#stylized-text-animation-duration');
    const intensityInput = els.textModal.querySelector('#stylized-text-animation-intensity');
    const exitInput = els.textModal.querySelector('#stylized-text-animation-exit');
    els.textModal.querySelectorAll('[data-text-exit]').forEach((button) => button.addEventListener('click', () => {
        exitInput.value = button.dataset.textExit || 'none';
        selectStylizedChoice('data-text-exit', exitInput.value);
        exitInput.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    [durationInput, intensityInput].forEach((input) => input?.addEventListener('input', () => {
        const output = els.textModal.querySelector(`#${input.id}-value`);
        if (output) output.textContent = input === durationInput ? `${Number(input.value).toFixed(1)} s` : `${Number(input.value).toFixed(2)}×`;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    [durationInput, intensityInput, exitInput].forEach((input) => input?.addEventListener('change', () => {
        stopStylizedMotionPreview();
        stylizedMotion = normalizeStylizedMotion({
            ...stylizedMotion,
            durationSec: Number(durationInput?.value || 0.8),
            intensity: Number(intensityInput?.value || 1),
            exit: exitInput?.value || 'fade'
        });
    }));
    const buildPreview = async () => {
        stopStylizedMotionPreview();
        const dataUrl = await renderStylizedTextToDataUrl(fabricCanvas.toJSON(['assetRole', 'assetStoragePath', 'labelTemplate', 'labelScale', 'stylizedEffect']));
        const container = els.textModal.querySelector('.pme-canvas-container');
        const overlay = document.createElement('div');
        overlay.className = 'pme-motion-preview-layer';
        const image = document.createElement('img');
        image.src = dataUrl;
        image.alt = '';
        overlay.append(image);
        container.append(overlay);
        stylizedPreviewOverlay = overlay;
        const canvasLayer = container.querySelector('.canvas-container');
        if (canvasLayer) canvasLayer.hidden = true;
        stylizedMotionPreview = createStylizedImageMotionTimeline({
            gsap: window.gsap, element: image,
            motion: stylizedMotion,
            sceneDurationSec: Math.max(1, Number(window.PodcasterState?.activeSession?.script?.rows?.find((row) => String(row?.id) === currentEditingRowId)?.durationSec || 8))
        });
        return stylizedMotionPreview;
    };
    els.textModal.querySelector('#stylizedTextPreviewAnimationBtn')?.addEventListener('click', async () => {
        if (stylizedMotionPreviewPlaying) {
            stopStylizedMotionPreview();
            return;
        }
        const preview = await buildPreview();
        if (!preview) return;
        stylizedMotionPreviewPlaying = true;
        syncStylizedMotionPreviewButton();
        preview.timeline?.eventCallback?.('onComplete', () => {
            if (stylizedMotionPreview === preview) stopStylizedMotionPreview();
        });
        preview.timeline?.eventCallback?.('onUpdate', () => {
            const durationSec = Math.max(1, Number(window.PodcasterState?.activeSession?.script?.rows?.find((row) => String(row?.id) === currentEditingRowId)?.durationSec || 8));
            const time = Number(preview.timeline.time?.() || 0);
            const scrub = els.textModal?.querySelector('#stylizedTextPreviewScrub');
            const output = els.textModal?.querySelector('#stylizedTextPreviewTime');
            if (scrub) scrub.value = String(Math.round(time / durationSec * 100));
            if (output) output.textContent = `${time.toFixed(1)} / ${durationSec.toFixed(1)} s`;
        });
        preview?.play();
    });
    els.textModal.querySelector('#stylizedTextPreviewScrub')?.addEventListener('input', async (event) => {
        const preview = stylizedMotionPreview || await buildPreview();
        preview?.timeline?.pause?.();
        stylizedMotionPreviewPlaying = false;
        syncStylizedMotionPreviewButton();
        const durationSec = Math.max(1, Number(window.PodcasterState?.activeSession?.script?.rows?.find((row) => String(row?.id) === currentEditingRowId)?.durationSec || 8));
        const time = durationSec * Number(event.target.value || 0) / 100;
        preview?.seek(time);
        const output = els.textModal?.querySelector('#stylizedTextPreviewTime');
        if (output) output.textContent = `${time.toFixed(1)} / ${durationSec.toFixed(1)} s`;
    });

    // Sync UI when selection changes
    fabricCanvas.on('selection:created', syncTextUI);
    fabricCanvas.on('selection:updated', syncTextUI);
    fabricCanvas.on('mouse:over', (event) => {
        const button = els.textModal?.querySelector('#stylizedTextDeleteElementBtn');
        button?.classList.toggle('is-element-hovered', Boolean(event.target && event.target === fabricCanvas.getActiveObject()));
    });
    fabricCanvas.on('mouse:out', () => {
        const button = els.textModal?.querySelector('#stylizedTextDeleteElementBtn');
        setTimeout(() => { if (!button?.matches(':hover')) button?.classList.remove('is-element-hovered'); }, 120);
    });
    fabricCanvas.on('object:moving', syncStylizedDeleteControl);
    fabricCanvas.on('object:scaling', () => { syncStylizedDeleteControl(); syncTextUI(); });
    fabricCanvas.on('object:modified', syncTextUI);
    fabricCanvas.on('selection:cleared', () => {
        els.textInput.value = '';
        if (els.textSize) { els.textSize.value = ''; els.textSize.disabled = true; }
        syncStylizedFormatControls();
        syncStylizedDeleteControl();
        syncStylizedLabelSizeControl();
    });
}

function syncTextUI() {
    const obj = currentTextObject();
    syncStylizedLabelSizeControl();
    syncStylizedDeleteControl();
    els.textModal?.querySelector('#stylizedTextDeleteElementBtn')?.classList.toggle('is-element-hovered', Boolean(fabricCanvas.getActiveObject()));
    if (!obj) {
        if (els.textSize) { els.textSize.value = ''; els.textSize.disabled = true; }
        syncStylizedFormatControls();
        return;
    }

    els.textInput.value = obj.text || '';
    els.textFont.value = obj.fontFamily || 'Inter';
    if (els.textSize) {
        const visualScaleY = Math.max(0.01, Math.abs(Number(obj.getObjectScaling?.().y || obj.scaleY || 1)));
        els.textSize.value = String(Math.round(Number(obj.fontSize || 54) * visualScaleY));
        els.textSize.disabled = false;
    }
    
    const color = (obj.fill || '#FFFFFF').toUpperCase();
    els.textColor.value = color;
    if (els.textColorLabel) els.textColorLabel.textContent = color;

    const align = obj.textAlign || 'left';
    els.alignBtns.forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.align === align);
    });
    syncStylizedFormatControls();
    syncStylizedDeleteControl();
}

function applyTextEffect(effect) {
    const activeObj = currentTextObject();
    if (!activeObj || activeObj.type !== 'i-text') return;

    activeObj.set('shadow', null);
    activeObj.set('stroke', null);
    activeObj.set('strokeWidth', 0);

    if (effect === 'soft-glow' || effect === 'glow') {
        activeObj.set('shadow', new fabric.Shadow({
            color: activeObj.fill,
            blur: 14,
            offsetX: 0,
            offsetY: 0
        }));
    } else if (effect === 'clean-outline' || effect === 'outline') {
        activeObj.set('stroke', '#111827');
        activeObj.set('strokeWidth', 3);
    } else if (effect === 'depth' || effect === 'shadow') {
        activeObj.set('shadow', new fabric.Shadow({
            color: 'rgba(0,0,0,0.55)',
            blur: 10,
            offsetX: 5,
            offsetY: 7
        }));
    } else if (effect === 'neon') {
        activeObj.set('stroke', activeObj.fill);
        activeObj.set('strokeWidth', 1.5);
        activeObj.set('shadow', new fabric.Shadow({ color: activeObj.fill, blur: 28, offsetX: 0, offsetY: 0 }));
    }
    activeObj.stylizedEffect = effect;
    refreshStylizedTextGroup(activeObj, fabricCanvas);
}

async function openStylizedTextEditor() {
    const session = window.PodcasterState?.activeSession;
    const rowId = String(window.PodcasterState?.activeRowId || session?.script?.rows?.[0]?.id || '').trim();
    if (!session || !rowId) return;
    if (!els.textModal) initElements();
    if (!els.textModal) return;

    if (String(window.PodcasterState?.activeRowId || '').trim() !== rowId) {
        window.PodcasterUI?.setPodcastVideoRow?.(rowId, { syncStage: false, lightweightUi: true });
    }

    currentEditingRowId = rowId;
    stopStylizedMotionPreview();
    els.textModal.hidden = false;
    presentUnifiedToolModal("text", els.textModal, rowId);
    
    // Give browser time to show the modal before initializing canvas
    requestAnimationFrame(() => {
        initFabric();
        syncStylizedScenePreviewMedia(session, rowId);
        fabricCanvas.clear();
        const editorSize = fitFabricCanvasToEditorContainer();
        
        // Load existing stylized text if any
        const existingText = session.stylizedTextMap?.[rowId];
        const parsedExisting = parseStylizedTextSceneData(existingText);
        stylizedMotion = normalizeStylizedMotion(parsedExisting?.animation);
        selectStylizedChoice('data-text-animation', stylizedMotion.preset);
        const durationInput = els.textModal.querySelector('#stylized-text-animation-duration');
        const intensityInput = els.textModal.querySelector('#stylized-text-animation-intensity');
        const exitInput = els.textModal.querySelector('#stylized-text-animation-exit');
        if (durationInput) durationInput.value = String(stylizedMotion.durationSec);
        if (intensityInput) intensityInput.value = String(stylizedMotion.intensity);
        if (exitInput) exitInput.value = stylizedMotion.exit;
        els.textModal.querySelector('#stylized-text-animation-duration-value').textContent = `${Number(stylizedMotion.durationSec).toFixed(1)} s`;
        els.textModal.querySelector('#stylized-text-animation-intensity-value').textContent = `${Number(stylizedMotion.intensity).toFixed(2)}×`;
        selectStylizedChoice('data-text-exit', stylizedMotion.exit);
        syncStylizedTimingControls(parsedExisting?.timing?.startSec || 0, parsedExisting?.timing?.durationSec || activeSceneDurationSec());
        const sanitizedTextData = transformStylizedTextSceneData(
            existingText,
            parseStylizedTextSceneData(existingText)?.width || STYLIZED_TEXT_STAGE_WIDTH,
            parseStylizedTextSceneData(existingText)?.height || STYLIZED_TEXT_STAGE_HEIGHT,
            STYLIZED_TEXT_STAGE_WIDTH,
            STYLIZED_TEXT_STAGE_HEIGHT
        );

        if (sanitizedTextData) {
            fabricCanvas.loadFromJSON(sanitizedTextData, () => {
                sanitizeFabricCanvasTextBaselines(fabricCanvas);
                fabricCanvas.setBackgroundColor('transparent', fabricCanvas.renderAll.bind(fabricCanvas));
                fabricCanvas.renderAll();
                const objects = fabricCanvas.getObjects();
                const legacyText = objects.find((item) => ['i-text', 'text', 'textbox'].includes(item.type));
                const legacyLabel = objects.find((item) => item.assetRole === 'label-background');
                if (legacyText && legacyLabel) attachStylizedLabel(fabricCanvas, fabric, legacyLabel, legacyText);
                else {
                    const editable = objects.find((item) => ['i-text', 'text', 'textbox'].includes(item.type) || item.assetRole === 'label-group');
                    if (editable) fabricCanvas.setActiveObject(editable);
                }
                const obj = currentTextObject();
                if (obj) {
                    fabricCanvas.setActiveObject(obj);
                    els.textInput.value = obj.text;
                    els.textFont.value = obj.fontFamily;
                    els.textColor.value = obj.fill;
                    els.textEffect.value = obj.stylizedEffect || 'none';
                    selectStylizedChoice('data-text-effect', els.textEffect.value);
                }
                const background = fabricCanvas.getObjects().find((item) => item.assetRole === 'label-group' || item.assetRole === 'label-background');
                selectStylizedChoice('data-label-template', background?.labelTemplate || 'none');
                syncStylizedDeleteControl();
            });
        } else {
            const text = new fabric.IText('Nuevo Texto', {
                left: Math.round(editorSize.width * 0.18),
                top: Math.round(editorSize.height * 0.68),
                fontFamily: 'Inter',
                fill: '#ffffff',
                fontSize: Math.max(28, Math.round(editorSize.height * 0.08)),
                originX: 'left',
                originY: 'center'
            });
            fabricCanvas.add(text);
            fabricCanvas.setActiveObject(text);
            els.textInput.value = 'Nuevo Texto';
            selectStylizedChoice('data-label-template', 'none');
            selectStylizedChoice('data-text-effect', 'none');
        }
    });
}

function setupEventListeners() {



    // Stylized Text
    if (els.addStylizedTextBtn) {
        els.addStylizedTextBtn.addEventListener('click', openStylizedTextEditor);
    }
    els.textModal?.querySelector('#stylizedTextUseSceneTextBtn')?.addEventListener('click', () => {
        const row = window.PodcasterState?.activeSession?.script?.rows?.find((item) => String(item?.id) === currentEditingRowId);
        const liveField = Array.from(document.querySelectorAll('[data-field="inSceneText"][data-row-id]'))
            .find((input) => input.dataset.rowId === currentEditingRowId);
        const text = String(liveField?.value || row?.inSceneText || '').trim();
        if (!text) {
            const status = document.getElementById('stylizedTextEditorStatus');
            if (status) status.textContent = 'Esta escena no tiene «Texto dentro de la escena».';
            return;
        }
        let selected = currentTextObject();
        if (!selected) {
            selected = new fabric.IText(text, { left: 180, top: 490, fontFamily: 'Inter', fill: '#ffffff', fontSize: 54 });
            fabricCanvas.add(selected);
        } else selected.set('text', text);
        refreshStylizedTextGroup(selected, fabricCanvas);
        fabricCanvas.setActiveObject(selected.group?.assetRole === 'label-group' ? selected.group : selected);
        els.textInput.value = text;
        fabricCanvas.renderAll();
    });
    els.textModal?.querySelector('#stylizedTextAddTextBtn')?.addEventListener('click', () => {
        const item = new fabric.IText('Nuevo texto', { left: 180, top: 360, fontFamily: 'Inter', fill: '#ffffff', fontSize: 54 });
        fabricCanvas.add(item); fabricCanvas.setActiveObject(item); fabricCanvas.renderAll(); syncTextUI();
    });
    els.textModal?.querySelector('#stylizedTextAddShapeBtn')?.addEventListener('click', () => {
        const item = new fabric.Rect({ left: 420, top: 270, width: 220, height: 110, rx: 18, ry: 18,
            fill: getComputedStyle(els.textModal).getPropertyValue('--pme-primary').trim() || '#6366f1' });
        fabricCanvas.add(item); fabricCanvas.setActiveObject(item); fabricCanvas.renderAll(); syncStylizedDeleteControl();
    });
    els.textModal?.querySelector('#stylizedTextDeleteElementBtn')?.addEventListener('click', () => {
        const selected = fabricCanvas?.getActiveObject?.();
        if (!selected) return;
        fabricCanvas.remove(selected); fabricCanvas.discardActiveObject(); fabricCanvas.renderAll(); syncStylizedDeleteControl();
    });
    els.textModal?.querySelectorAll('[data-text-format]').forEach((button) => button.addEventListener('click', () => {
        const selected = currentTextObject();
        if (!selected) return;
        const format = button.dataset.textFormat;
        if (format === 'bold') selected.set('fontWeight', selected.fontWeight === 'bold' ? 'normal' : 'bold');
        if (format === 'italic') selected.set('fontStyle', selected.fontStyle === 'italic' ? 'normal' : 'italic');
        if (format === 'underline') selected.set('underline', !selected.underline);
        refreshStylizedTextGroup(selected, fabricCanvas); syncStylizedFormatControls();
    }));
    const timingStart = els.textModal?.querySelector('#stylized-text-start-sec');
    const timingVisible = els.textModal?.querySelector('#stylized-text-visible-sec');
    [timingStart, timingVisible].forEach((input) => input?.addEventListener('input', () => {
        const gap = 0.5;
        if (input === timingStart) timingStart.value = String(Math.min(Number(timingStart.value), Number(timingVisible.value) - gap));
        else timingVisible.value = String(Math.max(Number(timingVisible.value), Number(timingStart.value) + gap));
        syncStylizedTimingControls(Number(timingStart.value), Number(timingVisible.value) - Number(timingStart.value));
    }));

    document.querySelector('.pme-color-picker-wrapper')?.addEventListener('click', (e) => {
        // Prevent recursive click if the target is the input itself
        if (e.target !== els.textColor) {
            els.textColor.click();
        }
    });

    const saveStylizedText = async () => {
        const session = window.PodcasterState?.activeSession;
        const rowId = String(currentEditingRowId || '').trim();
        if (!session || !rowId) return;
        stopStylizedMotionPreview();
        if (!fabricCanvas?.getObjects?.().length) {
            await deleteStylizedText();
            return;
        }

        const stageData = transformStylizedTextSceneData(
            fabricCanvas.toJSON(['assetRole', 'assetStoragePath', 'labelTemplate', 'labelScale', 'stylizedEffect']),
            STYLIZED_TEXT_STAGE_WIDTH,
            STYLIZED_TEXT_STAGE_HEIGHT,
            STYLIZED_TEXT_STAGE_WIDTH,
            STYLIZED_TEXT_STAGE_HEIGHT
        );
        stageData.animation = normalizeStylizedMotion(stylizedMotion);
        stageData.timing = {
            startSec: Number(timingStart?.value || 0),
            durationSec: Math.max(0.5, Number(timingVisible?.value || activeSceneDurationSec()) - Number(timingStart?.value || 0))
        };
        const json = JSON.stringify(stageData);
        
        try {
            invalidateStylizedTextBitmapCache();
            if (window.PodcasterUI?.upsertActiveSession) {
                const updated = window.PodcasterUI.upsertActiveSession((current) =>
                    setStylizedTextForScene(current, rowId, json),
                { render: false, persist: true, markDirty: true, autosaveReason: "stylized-text" });
                if (!updated) throw new Error('No se pudo actualizar el texto en la sesión activa.');
            } else if (session && typeof session === 'object') {
                session.stylizedTextMap = setStylizedTextForScene(session, rowId, json).stylizedTextMap;
            }
            window.PodcasterUI?.syncPlaybackSession?.();
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
            if (window.PodcasterUI?.render) {
                window.PodcasterUI.render();
            }
            try {
                await updateDoc(doc(db, 'podcaster_sessions', session.id), {
                    [`session.stylizedTextMap.${rowId}`]: json
                });
            } catch (cloudError) {
                console.warn('[podcaster][stylized-text] cloud save pending manual session save', cloudError);
            }
        } catch (err) {
            console.error('Error saving stylized text:', err);
        }
    };

    const deleteStylizedText = async () => {
        const session = window.PodcasterState?.activeSession;
        const rowId = String(currentEditingRowId || '').trim();
        if (!session || !rowId) return;

        try {
            invalidateStylizedTextBitmapCache();
            if (window.PodcasterUI?.upsertActiveSession) {
                const updated = window.PodcasterUI.upsertActiveSession((current) =>
                    setStylizedTextForScene(current, rowId),
                { render: false, persist: true, markDirty: true, autosaveReason: "stylized-text" });
                if (!updated) throw new Error('No se pudo quitar el texto de la sesión activa.');
            } else if (session && typeof session === 'object') {
                session.stylizedTextMap = setStylizedTextForScene(session, rowId).stylizedTextMap;
            }
            window.PodcasterUI?.syncPlaybackSession?.();
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
            if (window.PodcasterUI?.render) {
                window.PodcasterUI.render();
            }
            try {
                await updateDoc(doc(db, 'podcaster_sessions', session.id), {
                    [`session.stylizedTextMap.${rowId}`]: null
                });
            } catch (cloudError) {
                console.warn('[podcaster][stylized-text] cloud delete pending manual session save', cloudError);
            }
        } catch (err) {
            console.error('Error deleting stylized text:', err);
        }
    };

    if (els.saveTextBtn) {
        els.saveTextBtn.addEventListener('click', saveStylizedText);
    }
    if (els.deleteTextBtn) {
        els.deleteTextBtn.addEventListener('click', deleteStylizedText);
    }
    if (els.cancelTextBtn) {
        els.cancelTextBtn.addEventListener('click', () => {
            stopStylizedMotionPreview();
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
        });
    }
    if (els.closeTextBtn) {
        els.closeTextBtn.addEventListener('click', () => {
            stopStylizedMotionPreview();
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
        });
    }



    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest("[data-action='timeline-edit-stylized-text']");
        if (editBtn) {
            const rowId = String(editBtn.dataset.rowId || '').trim();
            if (rowId) {
                if (typeof window.PodcasterUI?.selectTimelineSceneRow === 'function') {
                    window.PodcasterUI.selectTimelineSceneRow(rowId, { syncStage: false });
                } else if (typeof window.PodcasterUI?.setPodcastVideoRow === 'function') {
                    window.PodcasterUI.setPodcastVideoRow(rowId, { syncStage: false, lightweightUi: true });
                }
            }
            openStylizedTextEditor();
        }
    });
}

function initPodcasterMediaEditor() {
    if (mediaEditorInitialized) return;
    initElements();
    if (!els.textModal || !els.addStylizedTextBtn) return;
    initializeStylizedEditorLayout();
    initializeStylizedControlAccordions();
    
    initFirebase();
    setupEventListeners();
    mediaEditorInitialized = true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPodcasterMediaEditor, { once: true });
} else {
    initPodcasterMediaEditor();
}

// Export for use in players
window.PodcasterMediaEditor = {
    pausePreview: stopStylizedMotionPreview,
    openTextEditor: (rowId = "") => {
        if (rowId && String(window.PodcasterState?.activeRowId || "") !== String(rowId)) {
            window.PodcasterUI?.setPodcastVideoRow?.(String(rowId), { syncStage: false, lightweightUi: true });
        }
        void openStylizedTextEditor();
    },
    prewarmStylizedText: async (rowId, session) => {
        const textDataStr = session?.stylizedTextMap?.[rowId];
        if (!textDataStr) return '';
        const textData = sanitizeStylizedTextSceneData(textDataStr);
        if (!textData?.objects?.length) return '';
        return renderStylizedTextToDataUrl(textData);
    },
    seekStylizedText: (container, localTimeSec = 0) => {
        container?.querySelector?.('.pme-stylized-text-render')?.__motion?.seek(localTimeSec);
    },
    renderStylizedText: async (container, rowId, session, options = {}) => {
        const textDataStr = session?.stylizedTextMap?.[rowId];
        if (!textDataStr) {
            container.innerHTML = '';
            container.hidden = true;
            return;
        }

        const textData = sanitizeStylizedTextSceneData(textDataStr);
        if (!textData?.objects?.length) {
            container.innerHTML = '';
            container.hidden = true;
            return;
        }
        container.innerHTML = '';
        container.hidden = false;

        const renderBox = resolveStylizedTextRenderBox(container);
        const renderToken = `${rowId}:${Date.now()}`;
        container.dataset.renderToken = renderToken;
        const bitmapSrc = await renderStylizedTextToDataUrl(textData);
        if (!bitmapSrc || container.dataset.renderToken !== renderToken) return;

        const imageEl = document.createElement('img');
        imageEl.className = 'pme-stylized-text-render';
        imageEl.alt = '';
        imageEl.decoding = 'async';
        imageEl.loading = 'eager';
        imageEl.src = bitmapSrc;
        imageEl.style.left = `${renderBox.left}px`;
        imageEl.style.top = `${renderBox.top}px`;
        imageEl.style.width = `${renderBox.width}px`;
        imageEl.style.height = `${renderBox.height}px`;
        container.innerHTML = '';
        container.appendChild(imageEl);
        const animation = parseStylizedTextSceneData(textDataStr)?.animation;
        if (animation && window.gsap) {
            imageEl.__motion = createStylizedImageMotionTimeline({
                gsap: window.gsap,
                element: imageEl,
                motion: animation,
                sceneDurationSec: Math.max(0.5, Number(options.durationSec || 8))
            });
            imageEl.__motion?.seek(Number(options.localTimeSec || 0));
        }
    },
    
    getImageMovementClass: (rowId, session) => {
        const effects = session?.visualEffectsMap?.[rowId];
        if (!effects || !effects.effects?.length) return '';
        
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map(e => `ken-burns-${e}`).join(' ');
        return `${effectClasses} ${speedClass}`;
    }
};
