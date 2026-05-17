import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, updateDoc, getDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig } from "../js/firebase-web-config.js";
import { buildApiUrl, getAuthHeaders } from "../js/api-client.js";

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
const VALID_CANVAS_TEXT_BASELINES = new Set([
    'top',
    'hanging',
    'middle',
    'alphabetic',
    'ideographic',
    'bottom'
]);
const STYLIZED_TEXT_ALLOWED_OBJECT_TYPES = new Set(['i-text', 'text', 'textbox', 'group']);

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

// --- DOM Elements ---
let els = {};

function initElements() {
    els = {
        textModal: document.getElementById('stylizedTextEditorModal'),
        textInput: document.getElementById('stylized-text-input'),
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
    return next;
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
    const width = Math.max(320, Math.round(Number(container?.clientWidth || 0) || 0) || 960);
    const height = Math.max(180, Math.round(Number(container?.clientHeight || 0) || 0) || 540);
    fabricCanvas.setDimensions({ width, height });
    fabricCanvas.setBackgroundColor('transparent', fabricCanvas.renderAll.bind(fabricCanvas));
    return { width, height };
}

function resolveStylizedTextRenderBox(container = null) {
    const host = container || null;
    if (!host) {
        return { width: STYLIZED_TEXT_STAGE_WIDTH, height: STYLIZED_TEXT_STAGE_HEIGHT, left: 0, top: 0 };
    }
    const hostRect = host.getBoundingClientRect?.() || null;
    const mediaCandidates = Array.from((host.parentElement || host).querySelectorAll('video, img'))
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

function normalizeStylizedPreviewAsset(raw = null, fallbackKind = 'video') {
    if (!raw || typeof raw !== 'object') return null;
    const src = String(raw.downloadUrl || raw.url || raw.dataUrl || '').trim();
    const mimeType = String(raw.mimeType || '').trim().toLowerCase();
    const explicitType = String(raw.type || raw.mediaKind || fallbackKind || '').trim().toLowerCase();
    const combined = `${src} ${String(raw.storagePath || '').trim()}`.toLowerCase();
    if (!src) return null;
    const isImage = explicitType === 'image'
        || mimeType.startsWith('image/')
        || /\.(png|jpe?g|webp|gif)(\?|$|\s)/i.test(combined);
    return {
        src,
        kind: isImage ? 'image' : 'video',
        mimeType
    };
}

function resolveStylizedScenePreviewMedia(session = null, rowId = '') {
    const key = String(rowId || '').trim();
    if (!session || !key) return null;

    const clip = session?.dialogueVideoMap?.[key] && typeof session.dialogueVideoMap[key] === 'object'
        ? session.dialogueVideoMap[key]
        : null;
    const segments = Array.isArray(clip?.segments) ? clip.segments.filter(Boolean) : [];
    const primarySegment = segments.find((item) => normalizeStylizedPreviewAsset(item, clip?.type || 'video')) || null;
    const fromClip = normalizeStylizedPreviewAsset(primarySegment || clip, clip?.type || 'video');
    if (fromClip) return fromClip;

    const imageList = Array.isArray(session?.rowReferenceImageListMap?.[key]) ? session.rowReferenceImageListMap[key] : [];
    const fromImageReference = normalizeStylizedPreviewAsset(imageList[0] || session?.rowReferenceImageMap?.[key] || null, 'image');
    if (fromImageReference) return fromImageReference;

    const fromVideoReference = normalizeStylizedPreviewAsset(session?.rowReferenceVideoMap?.[key] || null, 'video');
    return fromVideoReference;
}

function clearStylizedScenePreviewMedia() {
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

function syncStylizedScenePreviewMedia(session = null, rowId = '') {
    const container = document.querySelector('.pme-canvas-container');
    if (!container) return;
    clearStylizedScenePreviewMedia();
    const asset = resolveStylizedScenePreviewMedia(session, rowId);
    if (!asset?.src) return;

    const mediaEl = document.createElement(asset.kind === 'image' ? 'img' : 'video');
    mediaEl.className = 'pme-scene-preview-media';
    mediaEl.setAttribute('aria-hidden', 'true');
    mediaEl.src = asset.src;

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

function renderStylizedTextToDataUrl(textData = null) {
    const sanitizedTextData = sanitizeStylizedTextSceneData(textData);
    const cacheKey = buildStylizedTextBitmapCacheKey(sanitizedTextData);
    if (!cacheKey) return Promise.resolve('');
    if (stylizedTextBitmapCache.has(cacheKey)) {
        return Promise.resolve(stylizedTextBitmapCache.get(cacheKey) || '');
    }
    return new Promise((resolve) => {
        const canvasEl = document.createElement('canvas');
        canvasEl.width = STYLIZED_TEXT_STAGE_WIDTH;
        canvasEl.height = STYLIZED_TEXT_STAGE_HEIGHT;
        const staticCanvas = new fabric.StaticCanvas(canvasEl, {
            width: STYLIZED_TEXT_STAGE_WIDTH,
            height: STYLIZED_TEXT_STAGE_HEIGHT,
            backgroundColor: 'transparent',
            renderOnAddRemove: false
        });
        staticCanvas.loadFromJSON(sanitizedTextData, () => {
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
    
    const container = document.querySelector('.pme-canvas-container');
    const w = container.clientWidth || 960;
    const h = container.clientHeight || 540;

    fabricCanvas = new fabric.Canvas('stylized-text-fabric-canvas', {
        width: w,
        height: h,
        backgroundColor: 'transparent'
    });
    if (fabricCanvas.lowerCanvasEl) {
        fabricCanvas.lowerCanvasEl.style.background = 'transparent';
    }
    if (fabricCanvas.upperCanvasEl) {
        fabricCanvas.upperCanvasEl.style.background = 'transparent';
    }

    els.textInput.addEventListener('input', (e) => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && activeObj.type === 'i-text') {
            activeObj.set('text', e.target.value);
            fabricCanvas.renderAll();
        }
    });

    els.textFont.addEventListener('change', (e) => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && activeObj.type === 'i-text') {
            activeObj.set('fontFamily', e.target.value);
            fabricCanvas.renderAll();
        }
    });

    els.textColor.addEventListener('input', (e) => {
        const activeObj = fabricCanvas.getActiveObject();
        const color = e.target.value.toUpperCase();
        if (els.textColorLabel) els.textColorLabel.textContent = color;
        
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            activeObj.set('fill', color);
            fabricCanvas.renderAll();
        }
    });

    els.alignBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const align = btn.dataset.align;
            const activeObj = fabricCanvas.getActiveObject();
            
            els.alignBtns.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
                activeObj.set('textAlign', align);
                fabricCanvas.renderAll();
            }
        });
    });

    els.textEffect.addEventListener('change', (e) => {
        applyTextEffect(e.target.value);
    });

    // Sync UI when selection changes
    fabricCanvas.on('selection:created', syncTextUI);
    fabricCanvas.on('selection:updated', syncTextUI);
    fabricCanvas.on('selection:cleared', () => {
        els.textInput.value = '';
    });
}

function syncTextUI() {
    const obj = fabricCanvas.getActiveObject();
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'text')) return;

    els.textInput.value = obj.text || '';
    els.textFont.value = obj.fontFamily || 'Inter';
    
    const color = (obj.fill || '#FFFFFF').toUpperCase();
    els.textColor.value = color;
    if (els.textColorLabel) els.textColorLabel.textContent = color;

    const align = obj.textAlign || 'left';
    els.alignBtns.forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.align === align);
    });
}

function applyTextEffect(effect) {
    const activeObj = fabricCanvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'i-text') return;

    activeObj.set('shadow', null);
    activeObj.set('stroke', null);
    activeObj.set('strokeWidth', 0);

    if (effect === 'glow') {
        activeObj.set('shadow', new fabric.Shadow({
            color: activeObj.fill,
            blur: 20,
            offsetX: 0,
            offsetY: 0
        }));
    } else if (effect === 'outline') {
        activeObj.set('stroke', '#000');
        activeObj.set('strokeWidth', 2);
    } else if (effect === 'shadow') {
        activeObj.set('shadow', new fabric.Shadow({
            color: 'rgba(0,0,0,0.6)',
            blur: 5,
            offsetX: 5,
            offsetY: 5
        }));
    }
    fabricCanvas.renderAll();
}

async function openStylizedTextEditor() {
    const session = window.PodcasterState?.activeSession;
    const rowId = window.PodcasterState?.activeRowId;
    if (!session || !rowId) return;

    currentEditingRowId = rowId;
    els.textModal.hidden = false;
    
    // Give browser time to show the modal before initializing canvas
    requestAnimationFrame(() => {
        initFabric();
        syncStylizedScenePreviewMedia(session, rowId);
        fabricCanvas.clear();
        const editorSize = fitFabricCanvasToEditorContainer();
        
        // Load existing stylized text if any
        const existingText = session.stylizedTextMap?.[rowId];
        const sanitizedTextData = transformStylizedTextSceneData(
            existingText,
            parseStylizedTextSceneData(existingText)?.width || STYLIZED_TEXT_STAGE_WIDTH,
            parseStylizedTextSceneData(existingText)?.height || STYLIZED_TEXT_STAGE_HEIGHT,
            editorSize.width,
            editorSize.height
        );

        if (sanitizedTextData) {
            fabricCanvas.loadFromJSON(sanitizedTextData, () => {
                fabricCanvas.setBackgroundColor('transparent', fabricCanvas.renderAll.bind(fabricCanvas));
                fabricCanvas.renderAll();
                const obj = fabricCanvas.getObjects()[0];
                if (obj) {
                    fabricCanvas.setActiveObject(obj);
                    els.textInput.value = obj.text;
                    els.textFont.value = obj.fontFamily;
                    els.textColor.value = obj.fill;
                }
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
        }
    });
}

function setupEventListeners() {



    // Stylized Text
    els.addStylizedTextBtn.addEventListener('click', openStylizedTextEditor);

    document.querySelector('.pme-color-picker-wrapper')?.addEventListener('click', (e) => {
        // Prevent recursive click if the target is the input itself
        if (e.target !== els.textColor) {
            els.textColor.click();
        }
    });

    const saveStylizedText = async () => {
        const session = window.PodcasterState?.activeSession;
        if (!session || !currentEditingRowId) return;

        const stageData = transformStylizedTextSceneData(
            fabricCanvas.toJSON(),
            fabricCanvas.getWidth(),
            fabricCanvas.getHeight(),
            STYLIZED_TEXT_STAGE_WIDTH,
            STYLIZED_TEXT_STAGE_HEIGHT
        );
        const json = JSON.stringify(stageData);
        
        try {
            const sessionRef = doc(db, 'podcaster_sessions', session.id);
            const textMapRef = `session.stylizedTextMap.${currentEditingRowId}`;
            
            await updateDoc(sessionRef, {
                [textMapRef]: json
            });

            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
            if (window.PodcasterUI?.refreshSession) {
                await window.PodcasterUI.refreshSession();
            }
        } catch (err) {
            console.error('Error saving stylized text:', err);
        }
    };

    const deleteStylizedText = async () => {
        const session = window.PodcasterState?.activeSession;
        if (!session || !currentEditingRowId) return;

        try {
            const sessionRef = doc(db, 'podcaster_sessions', session.id);
            const textMapRef = `session.stylizedTextMap.${currentEditingRowId}`;
            
            await updateDoc(sessionRef, {
                [textMapRef]: null
            });

            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
            if (window.PodcasterUI?.refreshSession) {
                await window.PodcasterUI.refreshSession();
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
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
        });
    }
    if (els.closeTextBtn) {
        els.closeTextBtn.addEventListener('click', () => {
            clearStylizedScenePreviewMedia();
            els.textModal.hidden = true;
        });
    }



    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest("[data-action='timeline-edit-stylized-text']");
        if (editBtn) {
            window.PodcasterState.activeRowId = editBtn.dataset.rowId;
            openStylizedTextEditor();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    if (!els.textModal && !els.addStylizedTextBtn) return;
    
    initFirebase();
    setupEventListeners();
});

// Export for use in players
window.PodcasterMediaEditor = {
    prewarmStylizedText: async (rowId, session) => {
        const textDataStr = session?.stylizedTextMap?.[rowId];
        if (!textDataStr) return '';
        const textData = sanitizeStylizedTextSceneData(textDataStr);
        if (!textData?.objects?.length) return '';
        return renderStylizedTextToDataUrl(textData);
    },
    renderStylizedText: async (container, rowId, session) => {
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
    },
    
    getImageMovementClass: (rowId, session) => {
        const effects = session?.visualEffectsMap?.[rowId];
        if (!effects || !effects.effects?.length) return '';
        
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map(e => `ken-burns-${e}`).join(' ');
        return `${effectClasses} ${speedClass}`;
    }
};
