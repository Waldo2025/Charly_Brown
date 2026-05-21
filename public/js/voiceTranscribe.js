// -----------------------------------------------------------
            // 1. FIREBASE CONFIGURATION & IMPORTS
            // -----------------------------------------------------------
            import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
            import { 
                getFirestore, 
                doc, 
                updateDoc, 
                addDoc,
                collection, 
                getDocs,
                onSnapshot,
                arrayUnion,
                serverTimestamp,
                query,
                orderBy,
                deleteDoc,
                setDoc,
                getDoc,
                where
            } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
            import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
            import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
            import { firebaseWebConfig, assertFirebaseWebConfig } from './firebase-web-config.js';
            import { buildApiUrl, getAuthHeaders } from './api-client.js';
            import { escapeHtml, sanitizeAssistantHtml, setSanitizedHtml } from './security-utils.js';

            const toast = document.getElementById('toast');
            const runtimeHost = String(window.location.hostname || '').toLowerCase();
            const isLocalRuntime = ['localhost', '127.0.0.1'].includes(runtimeHost);
            const allowAnonymousProduction = window.__CHARLY_CONFIG__?.auth?.allowAnonymousInProduction === true;
            const allowAnonymousAuth = isLocalRuntime || allowAnonymousProduction;

            const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

            // Initialize Firebase
            let app;
            let db;
            let auth;
            let storage;
            let isFirebaseActive = false;
            async function ensureAuthenticatedFirebaseUser() {
                if (!auth) return null;
                if (auth.currentUser) return auth.currentUser;
                if (!allowAnonymousAuth) return null;
                try {
                    const userCredential = await signInAnonymously(auth);
                    return userCredential?.user || null;
                } catch (_) {
                    return null;
                }
            }

            try {
                if (firebaseConfig.apiKey) {
                    app = initializeApp(firebaseConfig);
                    db = getFirestore(app);
                    auth = getAuth(app);
                    storage = getStorage(app);
                    isFirebaseActive = true;
                    
                    // 🔥 🔥 🔥 AQUÍ VA EL CÓDIGO DE AUTENTICACIÓN 🔥 🔥 🔥
                    // Forzar autenticación anónima si no hay usuario
                    onAuthStateChanged(auth, async (user) => {
                        if (user) {
                            localStorage.setItem('firebaseUserId', user.uid);
                            loadSessionsList();
                            return;
                        }

                        const fallbackUser = await ensureAuthenticatedFirebaseUser();
                        if (fallbackUser) {
                            localStorage.setItem('firebaseUserId', fallbackUser.uid);
                            loadSessionsList();
                            return;
                        }

                        localStorage.removeItem('firebaseUserId');
                        if (!allowAnonymousAuth) {
                            showToast("Inicia sesión con una cuenta aprobada para usar sincronización en nube.");
                        } else {
                            showToast("Error de autenticación. Algunas funciones estarán limitadas.");
                        }
                        loadSessionsList();
                    });
                    // 🔥 🔥 🔥 FIN DEL CÓDIGO DE AUTENTICACIÓN 🔥 🔥 🔥

                } else {
                    showToast("Configura Firebase en el código para guardar sesiones.");
                }
            } catch (e) {
            }

            // -----------------------------------------------------------
            // 2. CONSTANTS & STATE
            // -----------------------------------------------------------
            let CHUNK_DURATION_MS = 600000; // valor inicial (editable desde el modal)
            const LIVE_AUDIO_DISABLED_MESSAGE = "La síntesis de audiolibro en tiempo real fue deshabilitada hasta migrarla a un endpoint backend seguro.";


            // DOM Elements
            const btnStart = document.getElementById('btnStart');
            const btnStop = document.getElementById('btnStop');
            const sessionFeed = document.getElementById('sessionFeed');
            const emptyState = document.getElementById('emptyState');
            const recordingStatus = document.getElementById('recordingStatus');
            const selectGeminiEndpoint = document.getElementById('selectGeminiEndpoint');
            const btnNewSession = document.getElementById('btnNewSession');
            const btnNewSessionList = document.getElementById('btnNewSessionList');
            const sessionList = document.getElementById('sessionList');
            const currentSessionTitle = document.getElementById('currentSessionTitle');
            const btnToggleSessionSelectionMode = document.getElementById('btnToggleSessionSelectionMode');
            const btnToggleSessionSelectionModeIcon = document.getElementById('btnToggleSessionSelectionModeIcon');
            const multiSessionActions = document.getElementById('multiSessionActions');
            const selectAllSessions = document.getElementById('selectAllSessions');
            const btnMultiAI = document.getElementById('btnMultiAI');
            const btnMultiChatIA = document.getElementById('btnMultiChatIA');
            const selectedSessionsCount = document.getElementById('selectedSessionsCount');
            
            const btnDownloadWord = document.getElementById('btnDownloadWord');
            const btnToolbarMenuToggle = document.getElementById('btnToolbarMenuToggle');
            const mainToolbarMenu = document.getElementById('mainToolbarMenu');
            
            const inputBlockMinutes = document.getElementById("inputBlockMinutes");
            const inputMicGain = document.getElementById("inputMicGain");
            const micGainValueLabel = document.getElementById("micGainValueLabel");
            const btnNextBlock = document.getElementById('btnNextBlock');
            const btnJumpFirstBlock = document.getElementById('btnJumpFirstBlock');
            const btnJumpMiddleBlock = document.getElementById('btnJumpMiddleBlock');
            const btnJumpLastBlock = document.getElementById('btnJumpLastBlock');
            const toggleMainHeaderBtn = document.getElementById('toggleMainHeaderBtn');
            const btnToggleChromeLayout = document.getElementById('btnToggleChromeLayout');
            const chromeLayoutIcon = document.getElementById('chromeLayoutIcon');

            const selectAction = document.getElementById("selectTone");
            const DEFAULT_TRANSCRIPTION_TONE = "structured";
            if (!localStorage.getItem("lastTone")) {
                localStorage.setItem("lastTone", DEFAULT_TRANSCRIPTION_TONE);
            }
            if (selectAction && !selectAction.value) {
                selectAction.value = localStorage.getItem("lastTone") || DEFAULT_TRANSCRIPTION_TONE;
            }
            // ===== MODAL CONFIGURACIÓN DE AUDIO (UNIFICADO) =====
            const audioConfigModal = document.getElementById("audioConfigModal");
            const btnAudioConfig = document.getElementById("btnAudioConfig");
            const btnCloseAudioConfig = document.getElementById("btnCloseAudioConfig");
            const btnCancelAudioConfig = document.getElementById("btnCancelAudioConfig");
            const btnSaveAudioConfig = document.getElementById("btnSaveAudioConfig");
            const btnTestAudio = document.getElementById("btnTestAudio");
            const btnRepairSession = document.getElementById("btnRepairSession");
            const contextNoteModal = document.getElementById("contextNoteModal");
            const contextNoteModalTitle = document.getElementById("contextNoteModalTitle");
            const contextNoteTextarea = document.getElementById("contextNoteTextarea");
            const contextNoteMeta = document.getElementById("contextNoteMeta");
            const contextNoteBlockId = document.getElementById("contextNoteBlockId");
            const btnCloseContextNoteModal = document.getElementById("btnCloseContextNoteModal");
            const btnCancelContextNote = document.getElementById("btnCancelContextNote");
            const btnSaveContextNote = document.getElementById("btnSaveContextNote");
            const btnDeleteContextNote = document.getElementById("btnDeleteContextNote");

            // Variables para tabs
            const tabBtns = document.querySelectorAll(".tab-btn");
            const tabContents = document.querySelectorAll(".tab-content");

            function getSessionBlocks() {
                return Array.from(sessionFeed.querySelectorAll('[id^="seg-"]'));
            }

            function jumpToBlock(targetEl, blockPos = "start") {
                if (!targetEl) return;
                const prevBehavior = sessionFeed.style.scrollBehavior;
                sessionFeed.style.scrollBehavior = "auto";
                targetEl.scrollIntoView({ behavior: "auto", block: blockPos });
                requestAnimationFrame(() => {
                    sessionFeed.style.scrollBehavior = prevBehavior || "";
                });
            }

            function jumpToFeedPosition(mode) {
                const blocks = getSessionBlocks();
                if (blocks.length) {
                    if (mode === "first") {
                        jumpToBlock(blocks[0]);
                        return;
                    }
                    if (mode === "middle") {
                        jumpToBlock(blocks[Math.floor((blocks.length - 1) / 2)]);
                        return;
                    }
                    if (mode === "last") {
                        jumpToBlock(blocks[blocks.length - 1], "end");
                        return;
                    }
                }
                const maxScroll = Math.max(0, sessionFeed.scrollHeight - sessionFeed.clientHeight);
                let top = 0;
                if (mode === "middle") top = Math.floor(maxScroll / 2);
                if (mode === "last") top = maxScroll;
                sessionFeed.scrollTo({ top, behavior: "auto" });
            }

            btnJumpFirstBlock?.addEventListener("click", () => jumpToFeedPosition("first"));
            btnJumpMiddleBlock?.addEventListener("click", () => jumpToFeedPosition("middle"));
            btnJumpLastBlock?.addEventListener("click", () => jumpToFeedPosition("last"));

            

            // State
            let globalStream = null;
            let rawInputStream = null;
            let isRecording = false;
            let segmentCounter = 0;
            let sessionRevision = 0;
            let recordingTimeout = null;
            let currentSessionId = null;
            let segmentsData = []; // Local cache of current session segments
            let chatHistory = {};
            let collapsedBlocksBySession = {};
            let selectedSessionIds = new Set();
            let isSessionSelectionMode = false;
            let currentSessionOwnerId = null;
            let sessionsIndex = [];
            let geminiAvailableModelsCache = null;
            let sessionTooLargeIds = new Set();
            let sessionUnsubscribe = null;
            let sessionSegmentsUnsubscribe = null;
            let sessionContextNotesUnsubscribe = null;
            let lastRemoteUpdate = 0;
            let lastRemoteSegmentsUpdate = 0;
            let lastRemoteContextNotesUpdate = 0;
            let lastRemoteTone = null;
            let blockContextNotes = {};
            const contextNotesCache = new Map();
            const TONE_CONTEXT_PROMPT_VERSION = "v2";

            async function geminiBackendFetch(path, options = {}) {
                const headers = await getAuthHeaders({
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                });
                const response = await fetch(buildApiUrl(path), {
                    ...options,
                    headers
                });
                const data = await response.json().catch(() => ({}));
                return { response, data };
            }

            function extractGeminiText(data) {
                return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            }


            // Variables de configuración
            let preferredAudioSource = localStorage.getItem('preferredAudioSource') || 'system';
            let autoNextBlock = localStorage.getItem('autoNextBlock') !== 'false'; // true por defecto
            let micGainValue = clampMicGain(parseFloat(localStorage.getItem('micGainValue') || '1'));

            function clampMicGain(value) {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) return 1;
                return Math.min(6, Math.max(0.5, parsed));
            }

            function formatMicGain(value) {
                return `${clampMicGain(value).toFixed(1)}x`;
            }

            function updateMicGainLabel(value) {
                if (micGainValueLabel) {
                    micGainValueLabel.textContent = formatMicGain(value);
                }
            }

            function normalizeContextNotesMap(raw) {
                const normalized = {};
                if (!raw || typeof raw !== "object") return normalized;
                Object.entries(raw).forEach(([key, value]) => {
                    const text = typeof value === "string" ? value.trim() : "";
                    if (!text) return;
                    normalized[String(key)] = text;
                });
                return normalized;
            }

            function getBlockContextNote(blockId) {
                return blockContextNotes[String(blockId)] || "";
            }

            function parseSpeakerNameHintsFromContext(noteText) {
                const hints = {};
                const raw = String(noteText || "");
                if (!raw) return hints;

                // Ejemplos soportados:
                // Persona 1: Ana
                // Hablante 2 = Carlos
                // P1 - Juan
                const re = /(?:persona|personaje|hablante|orador|speaker|voz|p)\s*([1-9]\d*)\s*[:=\-]\s*([^\n,;|]+)/gi;
                let m;
                while ((m = re.exec(raw)) !== null) {
                    const idx = String(m[1] || "").trim();
                    const candidate = String(m[2] || "")
                        .replace(/^[\"'“”‘’\s]+|[\"'“”‘’\s]+$/g, "")
                        .replace(/[.]+$/g, "")
                        .trim();
                    if (!idx || !candidate) continue;
                    if (candidate.length < 2 || candidate.length > 40) continue;
                    if (/^(persona|personaje|hablante|orador|speaker|voz)\s*\d+$/i.test(candidate)) continue;
                    hints[idx] = candidate;
                }

                return hints;
            }

            function remapSpeakerLabelWithContext(label, hintsMap) {
                const raw = String(label || "").trim();
                if (!raw || !hintsMap || typeof hintsMap !== "object") return raw;
                const m = raw.match(/^(?:persona|personaje|hablante|orador|speaker|voz)\s*([1-9]\d*)$/i);
                if (!m) return raw;
                const idx = String(m[1]);
                return hintsMap[idx] || raw;
            }

            function applyContextSpeakerNamesToSegment(seg) {
                if (!seg || !seg.analisis_voces || !Array.isArray(seg.analisis_voces.transcripcion_estructurada)) return;
                const note = getBlockContextNote(seg.id);
                const hints = parseSpeakerNameHintsFromContext(note);
                if (!Object.keys(hints).length) return;

                const updated = seg.analisis_voces.transcripcion_estructurada.map((item) => ({
                    persona: remapSpeakerLabelWithContext(item?.persona, hints),
                    texto: item?.texto || ""
                }));

                seg.analisis_voces.transcripcion_estructurada = updated;
                seg.analisis_voces.texto_dialogado = updated
                    .map(item => `${item.persona}: ${item.texto}`)
                    .join("\n");

                if (seg.analisis_voces.orador_principal) {
                    seg.analisis_voces.orador_principal = remapSpeakerLabelWithContext(seg.analisis_voces.orador_principal, hints);
                }

                const unique = new Set(updated.map(i => i.persona).filter(Boolean));
                if (unique.size) {
                    seg.analisis_voces.total_personas = unique.size;
                }
            }

            async function applyGeminiSpeakerNamesFromContext(seg) {
                if (!seg || !seg.analisis_voces || !Array.isArray(seg.analisis_voces.transcripcion_estructurada)) return;
                const note = getBlockContextNote(seg.id);
                if (!note || !note.trim()) return;

                const structured = seg.analisis_voces.transcripcion_estructurada || [];
                if (!structured.length) return;

                const genericLabels = Array.from(new Set(
                    structured
                        .map(item => String(item?.persona || "").trim())
                        .filter(label => /^(?:persona|personaje|hablante|orador|speaker|voz)\s*\d+$/i.test(label))
                ));
                if (!genericLabels.length) return;

                const signature = quickHash(`${note.trim()}|${genericLabels.join("|")}|${seg.raw || ""}`);
                if (seg.speakerNameHintsGeminiHash === signature && seg.speakerNameHintsGemini) {
                    const hints = seg.speakerNameHintsGemini;
                    seg.analisis_voces.transcripcion_estructurada = structured.map((item) => ({
                        persona: remapSpeakerLabelWithContext(item?.persona, hints),
                        texto: item?.texto || ""
                    }));
                    seg.analisis_voces.texto_dialogado = seg.analisis_voces.transcripcion_estructurada
                        .map(item => `${item.persona}: ${item.texto}`)
                        .join("\n");
                    if (seg.analisis_voces.orador_principal) {
                        seg.analisis_voces.orador_principal = remapSpeakerLabelWithContext(seg.analisis_voces.orador_principal, hints);
                    }
                    return;
                }

                const dialogPreview = structured
                    .slice(0, 16)
                    .map(item => `${item.persona}: ${String(item?.texto || "").slice(0, 180)}`)
                    .join("\n");

                const prompt = `Analiza la NOTA DE CONTEXTO y el diálogo.
Tarea: mapear etiquetas genéricas (Persona N) a nombres reales SOLO si están claramente indicados en la nota.

Reglas:
- No inventes nombres.
- Si no hay evidencia clara, deja la etiqueta igual.
- Responde SOLO JSON válido.
- Formato exacto:
{"mapeo":{"Persona 1":"Nombre","Persona 2":"Nombre"}}

NOTA DE CONTEXTO:
"""${String(note).replace(/"""/g, '\\"\\"\\"')}"""

ETIQUETAS DISPONIBLES:
${genericLabels.join(", ")}

DIÁLOGO (muestra):
${dialogPreview}`;

                try {
                    const raw = await fetchGeminiTextOnly(prompt, 2);
                    let parsed = null;
                    const jsonMatch = String(raw || "").match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        parsed = JSON.parse(jsonMatch[0]);
                    } else {
                        parsed = JSON.parse(String(raw || "").trim());
                    }

                    const mappingRaw = parsed?.mapeo && typeof parsed.mapeo === "object" ? parsed.mapeo : {};
                    const hints = {};
                    Object.entries(mappingRaw).forEach(([k, v]) => {
                        const key = String(k || "").trim();
                        const value = String(v || "").trim();
                        if (!/^(?:persona|personaje|hablante|orador|speaker|voz)\s*\d+$/i.test(key)) return;
                        if (!value || value.length < 2 || value.length > 40) return;
                        if (/^(?:persona|personaje|hablante|orador|speaker|voz)\s*\d+$/i.test(value)) return;
                        const idx = (key.match(/(\d+)/) || [])[1];
                        if (!idx) return;
                        hints[idx] = value;
                    });

                    seg.speakerNameHintsGemini = hints;
                    seg.speakerNameHintsGeminiHash = signature;
                    if (!Object.keys(hints).length) return;

                    seg.analisis_voces.transcripcion_estructurada = structured.map((item) => ({
                        persona: remapSpeakerLabelWithContext(item?.persona, hints),
                        texto: item?.texto || ""
                    }));
                    seg.analisis_voces.texto_dialogado = seg.analisis_voces.transcripcion_estructurada
                        .map(item => `${item.persona}: ${item.texto}`)
                        .join("\n");
                    if (seg.analisis_voces.orador_principal) {
                        seg.analisis_voces.orador_principal = remapSpeakerLabelWithContext(seg.analisis_voces.orador_principal, hints);
                    }
                    const unique = new Set(seg.analisis_voces.transcripcion_estructurada.map(i => i.persona).filter(Boolean));
                    if (unique.size) seg.analisis_voces.total_personas = unique.size;
                } catch (_) {
                    // Si Gemini no devuelve mapeo válido, mantener etiquetas actuales.
                }
            }

            function hasBlockContextNote(blockId) {
                return !!getBlockContextNote(blockId);
            }

            function setBlockContextNoteLocal(blockId, noteText) {
                const key = String(blockId);
                const text = typeof noteText === "string" ? noteText.trim() : "";
                if (text) {
                    blockContextNotes[key] = text;
                } else {
                    delete blockContextNotes[key];
                }
            }

            function canEditCurrentSession() {
                const uid = auth?.currentUser?.uid || null;
                if (!currentSessionId) return false;
                if (currentSessionOwnerId && uid && currentSessionOwnerId !== uid) return false;
                return true;
            }

            function updateContextNoteMetaLabel() {
                if (!contextNoteTextarea || !contextNoteMeta) return;
                const len = contextNoteTextarea.value.length;
                contextNoteMeta.textContent = `${len} / 3000`;
            }

            function closeContextNoteEditor() {
                if (!contextNoteModal) return;
                contextNoteModal.classList.add("hidden");
                contextNoteModal.classList.remove("flex");
            }

            function openContextNoteEditor(blockId) {
                if (!contextNoteModal || !contextNoteTextarea || !contextNoteBlockId) return;
                const idNum = Number(blockId);
                if (!Number.isFinite(idNum)) return;
                const note = getBlockContextNote(idNum);
                contextNoteBlockId.value = String(idNum);
                contextNoteTextarea.value = note;
                if (contextNoteModalTitle) {
                    contextNoteModalTitle.textContent = `Nota de Contexto · Bloque ${idNum}`;
                }
                if (btnDeleteContextNote) {
                    btnDeleteContextNote.classList.toggle("hidden", !note.trim());
                }
                updateContextNoteMetaLabel();
                contextNoteModal.classList.remove("hidden");
                contextNoteModal.classList.add("flex");
                setTimeout(() => {
                    contextNoteTextarea.focus();
                    contextNoteTextarea.setSelectionRange(contextNoteTextarea.value.length, contextNoteTextarea.value.length);
                }, 10);
            }

            async function persistContextNotesForCurrentSession() {
                if (!currentSessionId) return;
                const normalized = normalizeContextNotesMap(blockContextNotes);
                if (typeof multiSessionTextCache !== "undefined") {
                    multiSessionTextCache.clear();
                }
                contextNotesCache.set(currentSessionId, {
                    notes: { ...normalized },
                    updatedAt: Date.now()
                });
                blockContextNotes = normalized;

                if (!isFirebaseActive) return;
                const user = auth.currentUser;
                if (!user) return;
                if (currentSessionOwnerId && currentSessionOwnerId !== user.uid) {
                    throw new Error("Solo el propietario puede modificar notas de contexto.");
                }

                await setDoc(doc(db, "audioTranslateContextNotes", currentSessionId), {
                    sessionId: currentSessionId,
                    userId: user.uid,
                    notes: normalized,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            async function loadContextNotesForSession(sessionId) {
                blockContextNotes = {};
                lastRemoteContextNotesUpdate = 0;
                if (!sessionId || !isFirebaseActive) {
                    return;
                }

                try {
                    const snap = await getDoc(doc(db, "audioTranslateContextNotes", sessionId));
                    if (!snap.exists()) {
                        contextNotesCache.set(sessionId, { notes: {}, updatedAt: 0 });
                        return;
                    }
                    const data = snap.data() || {};
                    const notes = normalizeContextNotesMap(data.notes);
                    blockContextNotes = notes;
                    const updatedAt = getTimestampSeconds(data.updatedAt);
                    lastRemoteContextNotesUpdate = updatedAt || 0;
                    contextNotesCache.set(sessionId, { notes: { ...notes }, updatedAt: updatedAt || Date.now() });
                } catch (err) {
                    blockContextNotes = {};
                }
            }

            async function fetchContextNotesMapForSession(sessionId) {
                if (!sessionId) return {};
                if (sessionId === currentSessionId) {
                    return { ...blockContextNotes };
                }

                const cached = contextNotesCache.get(sessionId);
                if (cached && cached.notes) {
                    return { ...cached.notes };
                }

                if (!isFirebaseActive) return {};
                try {
                    const snap = await getDoc(doc(db, "audioTranslateContextNotes", sessionId));
                    if (!snap.exists()) {
                        contextNotesCache.set(sessionId, { notes: {}, updatedAt: 0 });
                        return {};
                    }
                    const data = snap.data() || {};
                    const notes = normalizeContextNotesMap(data.notes);
                    const updatedAt = getTimestampSeconds(data.updatedAt);
                    contextNotesCache.set(sessionId, { notes: { ...notes }, updatedAt: updatedAt || Date.now() });
                    return notes;
                } catch (err) {
                    return {};
                }
            }

            function rerenderSegmentsForContextNotes() {
                if (!Array.isArray(segmentsData)) return;
                segmentsData.forEach(seg => {
                    if (!seg || seg.id == null) return;
                    const node = document.getElementById(`seg-${seg.id}`);
                    if (node) renderSegment(seg);
                });
            }

            function ensureElementId(el, prefix = "menu-anchor") {
                if (!el) return "";
                if (!el.id) {
                    el.id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                }
                return el.id;
            }

            function restorePortalMenu(menu) {
                if (!menu) return;
                const anchorId = menu.dataset.anchorId || "";
                const anchor = anchorId ? document.getElementById(anchorId) : null;
                if (anchor) {
                    anchor.appendChild(menu);
                } else if (menu.parentElement === document.body) {
                    menu.remove();
                    return;
                }
                menu.classList.remove("menu-portal");
                menu.classList.add("hidden");
                menu.style.top = "";
                menu.style.left = "";
                menu.style.right = "";
                menu.style.bottom = "";
                menu.style.position = "";
                menu.style.marginTop = "";
                menu.style.zIndex = "";
                delete menu.dataset.anchorId;
                delete menu.dataset.blockId;
            }

            function closeAllBlockMenus() {
                document.querySelectorAll(".menu-block").forEach(menu => {
                    if (menu.classList.contains("menu-portal") || menu.dataset.anchorId) {
                        restorePortalMenu(menu);
                    } else {
                        menu.classList.add("hidden");
                    }
                });
            }

            function openBlockMenuAsPortal(menuBtn) {
                if (!menuBtn) return;
                const blockId = String(menuBtn.dataset.id || "");
                if (!blockId) return;

                const openedPortal = document.querySelector(`.menu-block.menu-portal[data-block-id="${blockId}"]:not(.hidden)`);
                if (openedPortal) {
                    closeAllBlockMenus();
                    return;
                }

                const blockEl = document.getElementById(`seg-${blockId}`);
                const menu = blockEl?.querySelector(".menu-block");
                if (!menu) return;

                closeAllBlockMenus();

                const anchor = menu.parentElement;
                if (!anchor) return;
                const anchorId = ensureElementId(anchor);

                menu.dataset.anchorId = anchorId;
                menu.dataset.blockId = blockId;
                menu.classList.add("menu-portal");
                menu.classList.remove("hidden");
                document.body.appendChild(menu);

                const rect = menuBtn.getBoundingClientRect();
                const menuWidth = menu.offsetWidth || 210;
                const menuHeight = menu.offsetHeight || 280;
                const gap = 8;

                let left = rect.right - menuWidth;
                if (left < gap) left = gap;
                if ((left + menuWidth) > (window.innerWidth - gap)) {
                    left = Math.max(gap, window.innerWidth - menuWidth - gap);
                }

                let top = rect.bottom + 6;
                if ((top + menuHeight) > (window.innerHeight - gap)) {
                    top = Math.max(gap, rect.top - menuHeight - 6);
                }

                menu.style.position = "fixed";
                menu.style.top = `${top}px`;
                menu.style.left = `${left}px`;
                menu.style.right = "auto";
                menu.style.bottom = "auto";
                menu.style.marginTop = "0";
                menu.style.zIndex = "2147483647";
            }

            // -----------------------------------------------------------
            // 3. LOGIC: GEMINI & RECORDING
            // -----------------------------------------------------------

            btnStart.addEventListener('click', startContinuousRecording);
            btnStop.addEventListener('click', stopContinuousRecording);
            btnNewSession.addEventListener('click', createNewSession);
            if (btnNewSessionList) {
                btnNewSessionList.addEventListener('click', createNewSession);
            }
            if (btnRepairSession) {
                btnRepairSession.addEventListener("click", () => {
                    repairCurrentSession();
                });
            }

            if (btnCloseContextNoteModal) {
                btnCloseContextNoteModal.addEventListener("click", closeContextNoteEditor);
            }
            if (btnCancelContextNote) {
                btnCancelContextNote.addEventListener("click", closeContextNoteEditor);
            }
            if (contextNoteModal) {
                contextNoteModal.addEventListener("click", (e) => {
                    if (e.target === contextNoteModal) {
                        closeContextNoteEditor();
                    }
                });
            }
            if (contextNoteTextarea) {
                contextNoteTextarea.addEventListener("input", () => {
                    updateContextNoteMetaLabel();
                    if (btnDeleteContextNote) {
                        btnDeleteContextNote.classList.toggle("hidden", !contextNoteTextarea.value.trim());
                    }
                });
            }
            if (btnSaveContextNote) {
                btnSaveContextNote.addEventListener("click", async () => {
                    const blockId = Number(contextNoteBlockId?.value || "");
                    if (!Number.isFinite(blockId)) return;
                    if (!canEditCurrentSession()) {
                        showToast("Solo el propietario puede modificar notas de contexto.");
                        return;
                    }

                    setBlockContextNoteLocal(blockId, contextNoteTextarea?.value || "");
                    try {
                        await persistContextNotesForCurrentSession();
                        if (typeof multiSessionTextCache !== "undefined") {
                            multiSessionTextCache.clear();
                        }
                        const seg = segmentsData.find(s => Number(s.id) === blockId);
                        if (seg) renderSegment(seg);
                        closeContextNoteEditor();
                        showToast("Nota de contexto guardada.");
                    } catch (err) {
                        showToast("No se pudo guardar la nota de contexto.");
                    }
                });
            }
            if (btnDeleteContextNote) {
                btnDeleteContextNote.addEventListener("click", async () => {
                    const blockId = Number(contextNoteBlockId?.value || "");
                    if (!Number.isFinite(blockId)) return;
                    if (!canEditCurrentSession()) {
                        showToast("Solo el propietario puede modificar notas de contexto.");
                        return;
                    }
                    setBlockContextNoteLocal(blockId, "");
                    if (contextNoteTextarea) contextNoteTextarea.value = "";
                    updateContextNoteMetaLabel();
                    btnDeleteContextNote.classList.add("hidden");
                    try {
                        await persistContextNotesForCurrentSession();
                        if (typeof multiSessionTextCache !== "undefined") {
                            multiSessionTextCache.clear();
                        }
                        const seg = segmentsData.find(s => Number(s.id) === blockId);
                        if (seg) renderSegment(seg);
                        closeContextNoteEditor();
                        showToast("Nota de contexto eliminada.");
                    } catch (err) {
                        showToast("No se pudo eliminar la nota de contexto.");
                    }
                });
            }

            // listeners modal IA de sesión
            
            document.getElementById('btnOpenAI').addEventListener('click', () => {
                // Limpiar cualquier modo anterior
                window.aiModalMode = 'global';
                window.aiModalBlockId = null;
                window.aiModalTarget = null;
                
                // Restaurar títulos si es necesario
                const modalTitle = document.querySelector('#aiModal h3 span');
                const modalSubtitle = document.querySelector('#aiModal p.text-slate-500');
                
                modalTitle.textContent = 'Herramientas de IA';
                modalSubtitle.textContent = 'Cambia el tono del texto o genera resúmenes, análisis y cursos.';
                
                
                // Abrir modal normal
                openAIModal();
            });

            const btnApplyToneAll = document.getElementById('btnApplyToneAll');
            if (btnApplyToneAll) {
                btnApplyToneAll.addEventListener('click', () => {
                    applyCurrentToneToAllAndClean();
                });
            }


            document.getElementById('btnCloseAIModal').addEventListener('click', closeAIModal);

            btnDownloadWord.addEventListener("click", exportSessionToWord);

            function closeMainToolbarMenu() {
                if (!mainToolbarMenu || !btnToolbarMenuToggle) return;
                mainToolbarMenu.classList.add("hidden");
                btnToolbarMenuToggle.setAttribute("aria-expanded", "false");
            }

            function toggleMainToolbarMenu(forceOpen = null) {
                if (!mainToolbarMenu || !btnToolbarMenuToggle) return;
                const shouldOpen = forceOpen === null
                    ? mainToolbarMenu.classList.contains("hidden")
                    : !!forceOpen;
                mainToolbarMenu.classList.toggle("hidden", !shouldOpen);
                btnToolbarMenuToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
            }

            if (btnToolbarMenuToggle && mainToolbarMenu) {
                btnToolbarMenuToggle.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggleMainToolbarMenu();
                });

                mainToolbarMenu.addEventListener("click", (e) => {
                    const clickedBtn = e.target.closest("button");
                    if (!clickedBtn) return;
                    closeMainToolbarMenu();
                });

                document.addEventListener("click", (e) => {
                    const isInsideMenu = e.target.closest(".toolbar-menu-wrapper");
                    if (!isInsideMenu) closeMainToolbarMenu();
                });

                document.addEventListener("keydown", (e) => {
                    if (e.key === "Escape") closeMainToolbarMenu();
                });

                window.addEventListener("resize", () => {
                    closeMainToolbarMenu();
                });
            }

            function syncMainHeaderToggle() {
                const hidden = localStorage.getItem("mainToolbarHidden") === "true";
                document.body.classList.toggle("main-header-hidden", hidden);
                const toolbarEl = document.getElementById("mainToolbar");
                if (toolbarEl) {
                    toolbarEl.classList.toggle("hidden", hidden);
                    toolbarEl.style.display = hidden ? "none" : "";
                    toolbarEl.setAttribute("aria-hidden", hidden ? "true" : "false");
                }
                if (toggleMainHeaderBtn) {
                    toggleMainHeaderBtn.innerHTML = hidden
                        ? `<i class="fa-solid fa-window-maximize text-xs"></i><span class="text-xs ml-1">Header</span>`
                        : `<i class="fa-solid fa-window-minimize text-xs"></i><span class="text-xs ml-1">Header</span>`;
                    toggleMainHeaderBtn.setAttribute("aria-label", hidden ? "Mostrar header" : "Ocultar header");
                    toggleMainHeaderBtn.setAttribute("title", hidden ? "Mostrar header" : "Ocultar header");
                }
            }

            if (toggleMainHeaderBtn) {
                toggleMainHeaderBtn.addEventListener("click", () => {
                    const next = !document.body.classList.contains("main-header-hidden");
                    localStorage.setItem("mainToolbarHidden", String(next));
                    syncMainHeaderToggle();
                });
                syncMainHeaderToggle();
            }

            const DESKTOP_CHROME_HIDDEN_KEY = "desktopChromeHidden";
            const MOBILE_CHROME_VISIBLE_KEY = "mobileChromeVisible";
            const isMobileViewportWidth = () => window.innerWidth < 768;

            function syncChromeLayoutToggle() {
                const isMobile = isMobileViewportWidth();
                const desktopHidden = localStorage.getItem(DESKTOP_CHROME_HIDDEN_KEY) === "true";
                const mobileVisible = localStorage.getItem(MOBILE_CHROME_VISIBLE_KEY) === "true";

                document.body.classList.toggle("chrome-hidden", !isMobile && desktopHidden);
                document.body.classList.toggle("chrome-visible", isMobile && mobileVisible);

                const isVisibleNow = isMobile ? mobileVisible : !desktopHidden;
                const label = isVisibleNow
                    ? "Ocultar sidebar y header principal"
                    : "Mostrar sidebar y header principal";

                if (btnToggleChromeLayout) {
                    btnToggleChromeLayout.setAttribute("aria-label", label);
                    btnToggleChromeLayout.setAttribute("title", label);
                }

                if (chromeLayoutIcon) {
                    chromeLayoutIcon.classList.toggle("fa-eye-slash", isVisibleNow);
                    chromeLayoutIcon.classList.toggle("fa-eye", !isVisibleNow);
                }
            }

            if (btnToggleChromeLayout) {
                btnToggleChromeLayout.addEventListener("click", () => {
                    if (isMobileViewportWidth()) {
                        const nextVisible = !document.body.classList.contains("chrome-visible");
                        localStorage.setItem(MOBILE_CHROME_VISIBLE_KEY, String(nextVisible));
                    } else {
                        const nextHidden = !document.body.classList.contains("chrome-hidden");
                        localStorage.setItem(DESKTOP_CHROME_HIDDEN_KEY, String(nextHidden));
                    }
                    syncChromeLayoutToggle();
                });
                syncChromeLayoutToggle();
                window.addEventListener("resize", syncChromeLayoutToggle);
            }

            // Abrir modal
            btnAudioConfig.addEventListener("click", () => {
                // 🔥 MOSTRAR SIEMPRE EL VALOR ACTUAL EN MINUTOS
                const currentMinutes = CHUNK_DURATION_MS / 60000;
                inputBlockMinutes.value = currentMinutes;
                
                document.getElementById("autoNextBlock").checked = autoNextBlock;
                if (inputMicGain) {
                    inputMicGain.value = String(clampMicGain(micGainValue));
                }
                updateMicGainLabel(micGainValue);
                
                // Actualizar selección de fuente de audio
                updateAudioSourceButtons();
                
                // Asegurar que el tab activo sea "blocks"
                switchTab('blocks');
                
                // Mostrar modal
                audioConfigModal.classList.remove("hidden");
                audioConfigModal.classList.add("flex");
            });

            function logAudioConfig() {
            }

            // Cerrar modal
            btnCloseAudioConfig.addEventListener("click", closeAudioConfigModal);
            btnCancelAudioConfig.addEventListener("click", closeAudioConfigModal);

            audioConfigModal.addEventListener("click", (e) => {
                if (e.target === audioConfigModal) {
                    closeAudioConfigModal();
                }
            });

            // Función para cerrar modal
            function closeAudioConfigModal() {
                audioConfigModal.classList.add("hidden");
                audioConfigModal.classList.remove("flex");
            }

            // Manejar tabs
            tabBtns.forEach(btn => {
                btn.addEventListener("click", () => {
                    const tab = btn.dataset.tab;
                    switchTab(tab);
                });
            });

            function switchTab(tabName) {
                // Actualizar botones de tab
                tabBtns.forEach(btn => {
                    if (btn.dataset.tab === tabName) {
                        btn.classList.add("active-tab");
                        btn.classList.remove("border-transparent");
                        btn.classList.add("border-indigo-500");
                    } else {
                        btn.classList.remove("active-tab", "border-indigo-500");
                        btn.classList.add("border-transparent");
                    }
                });
                
                // Mostrar contenido del tab
                tabContents.forEach(content => {
                    if (content.id === `tab-${tabName}`) {
                        content.classList.remove("hidden");
                    } else {
                        content.classList.add("hidden");
                    }
                });
            }

            // Manejar selección de fuente de audio
            document.querySelectorAll(".audio-source-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const source = btn.dataset.source;
                    preferredAudioSource = source;
                    updateAudioSourceButtons();
                    showToast(`✅ Fuente seleccionada: ${getSourceLabel(source)}`);
                });
            });

            function updateAudioSourceButtons() {
                document.querySelectorAll(".audio-source-btn").forEach(btn => {
                    if (btn.dataset.source === preferredAudioSource) {
                        // Resaltar seleccionado
                        btn.classList.remove("border-slate-200", "bg-slate-50");
                        btn.classList.add("border-blue-400", "bg-blue-100");
                        
                        // Actualizar colores según fuente
                        const source = btn.dataset.source;
                        if (source === 'system') {
                            btn.classList.add("border-blue-400", "bg-blue-100");
                        } else if (source === 'microphone') {
                            btn.classList.add("border-green-400", "bg-green-100");
                        } else if (source === 'device') {
                            btn.classList.add("border-emerald-400", "bg-emerald-100");
                        }
                    } else {
                        // Restaurar estado normal
                        btn.classList.remove(
                            "border-blue-400", "bg-blue-100",
                            "border-green-400", "bg-green-100",
                            "border-emerald-400", "bg-emerald-100"
                        );
                        btn.classList.add("border-slate-200", "bg-slate-50");
                    }
                });
            }

            function getSourceLabel(source) {
                switch(source) {
                    case 'system': return 'Audio del Sistema';
                    case 'microphone': return 'Micrófono';
                    case 'device': return 'Dispositivo Específico';
                    default: return 'Desconocido';
                }
            }

            if (inputMicGain) {
                inputMicGain.addEventListener("input", () => {
                    updateMicGainLabel(parseFloat(inputMicGain.value));
                });
            }

            // Botón para probar audio
            btnTestAudio.addEventListener("click", async () => {
                try {
                    showToast("🔍 Probando fuente de audio...");
                    
                    let stream;
                    
                    // Detener cualquier grabación en curso
                    if (isRecording) {
                        stopContinuousRecording();
                    }
                    
                    if (preferredAudioSource === 'system') {
                        // Intentar audio del sistema
                        try {
                            // Primero intentar con getDisplayMedia
                            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                                stream = await navigator.mediaDevices.getDisplayMedia({
                                    video: {
                                        displaySurface: "browser",
                                        cursor: "never"
                                    },
                                    audio: {
                                        echoCancellation: false,
                                        noiseSuppression: false,
                                        sampleRate: 44100,
                                        channelCount: 2
                                    },
                                    audio: true,
                                    preferCurrentTab: true
                                });
                                
                                const audioTracks = stream.getAudioTracks();
                                if (audioTracks.length > 0) {
                                    showToast("✅ Audio del sistema funcionando correctamente");
                                    
                                    // Detener video tracks
                                    const videoTracks = stream.getVideoTracks();
                                    videoTracks.forEach(track => track.stop());
                                    
                                    // Crear elemento de audio para verificar
                                    const audio = new Audio();
                                    const mediaStream = new MediaStream(audioTracks);
                                    audio.srcObject = mediaStream;
                                    audio.volume = 0.1; // Bajo volumen para prueba
                                    
                                    // Detener después de 3 segundos
                                    setTimeout(() => {
                                        audioTracks.forEach(track => track.stop());
                                        audio.srcObject = null;
                                        showToast("✅ Prueba de audio completada");
                                    }, 3000);
                                    
                                    return;
                                } else {
                                    showToast("⚠️ No se obtuvo audio del sistema");
                                    stream.getTracks().forEach(track => track.stop());
                                }
                            }
                        } catch (systemErr) {
                        }
                        
                        // Fallback a micrófono
                        showToast("Probando micrófono como alternativa...");
                        try {
                            const mic = await getMicrophone();
                            if (mic) {
                                stream = mic.stream;
                                showToast("✅ Micrófono funcionando correctamente");
                                
                                // Detener después de 2 segundos
                                setTimeout(() => {
                                    stream.getTracks().forEach(track => track.stop());
                                    showToast("✅ Prueba de micrófono completada");
                                }, 2000);
                            }
                        } catch (micErr) {
                        }
                        
                    } else if (preferredAudioSource === 'microphone') {
                        try {
                            const mic = await getMicrophone();
                            if (mic) {
                                stream = mic.stream;
                                showToast("✅ Micrófono funcionando correctamente");
                                
                                // Detener después de 2 segundos
                                setTimeout(() => {
                                    stream.getTracks().forEach(track => track.stop());
                                    showToast("✅ Prueba de micrófono completada");
                                }, 2000);
                            }
                        } catch (micErr) {
                            showToast("❌ Error al acceder al micrófono: " + micErr.message);
                        }
                    } else if (preferredAudioSource === 'device') {
                        showToast("⚠️ Para probar dispositivo específico, selecciona uno manualmente");
                    }
                    
                    if (!stream) {
                        showToast("❌ No se pudo acceder al audio");
                    }
                } catch (err) {
                    showToast("❌ Error al probar audio: " + err.message);
                }
            });


            // Guardar configuración
            btnSaveAudioConfig.addEventListener("click", async () => {
                const previousMinutes = CHUNK_DURATION_MS / 60000;
                const previousSource = preferredAudioSource;
                const previousAutoNext = autoNextBlock;
                const previousGain = micGainValue;

                const min = parseInt(inputBlockMinutes.value);
                autoNextBlock = document.getElementById("autoNextBlock").checked;
                micGainValue = clampMicGain(parseFloat(inputMicGain?.value || String(micGainValue)));

                if (isNaN(min) || min < 1 || min > 120) {
                    showToast("Ingresa una duración válida (entre 1 y 120 minutos)");
                    inputBlockMinutes.focus();
                    return;
                }

                // 🔥 GUARDAR EN MULTIPLES LUGARES PARA SEGURIDAD
                CHUNK_DURATION_MS = min * 60000;
                
                // Guardar en localStorage con dos claves para compatibilidad
                localStorage.setItem('blockDurationMinutes', min.toString());
                localStorage.setItem('blockMinutes', min.toString()); // Para compatibilidad
                localStorage.setItem('preferredAudioSource', preferredAudioSource);
                localStorage.setItem('autoNextBlock', autoNextBlock.toString());
                localStorage.setItem('micGainValue', micGainValue.toString());
                updateMicGainLabel(micGainValue);


                // 🔥 Guardar configuración en Firebase si hay sesión activa
                if (isFirebaseActive && currentSessionId) {
                    try {
                        const sessionRef = doc(db, "audioTranslate", currentSessionId);
                        await updateDoc(sessionRef, {
                            config: { 
                                blockMinutes: min,
                                blockDurationMinutes: min, // Doble seguro
                                audioSource: preferredAudioSource,
                                autoNextBlock: autoNextBlock,
                                micGainValue: micGainValue
                            },
                            lastUpdated: serverTimestamp()
                        }, { merge: true });
                    } catch (e) {
                    }
                }

                // Actualizar UI
                updateAudioConfigButton();
                updateNextBlockButton();

                showToast(`✅ Configuración guardada: Bloques ${min} min, fuente ${getSourceLabel(preferredAudioSource)}, ganancia ${formatMicGain(micGainValue)}`);
                
                // Aplicar ganancia en vivo si se está grabando
                if (isRecording) {
                    applyLiveMicGain(micGainValue);
                }

                const restartRequired = (
                    previousMinutes !== min ||
                    previousSource !== preferredAudioSource ||
                    previousAutoNext !== autoNextBlock
                );

                // Si está grabando y cambió una configuración estructural, preguntar reinicio
                if (isRecording) {
                    if (restartRequired && confirm(`La nueva configuración requiere reiniciar la grabación. ¿Deseas continuar?`)) {
                        stopContinuousRecording();
                        setTimeout(() => startContinuousRecording(), 1000);
                    } else if (!restartRequired && previousGain !== micGainValue) {
                        showToast(`🎚️ Ganancia aplicada en vivo: ${formatMicGain(micGainValue)}`);
                    }
                }
                
                closeAudioConfigModal();
            });

            // Función para actualizar el botón de configuración de audio
            function updateAudioConfigButton() {
                if (!btnAudioConfig) return;
                
                const icons = {
                    'system': 'fa-computer',
                    'microphone': 'fa-microphone',
                    'device': 'fa-sliders'
                };
                
                const colors = {
                    'system': 'indigo',
                    'microphone': 'green',
                    'device': 'emerald'
                };
                
                const color = colors[preferredAudioSource] || 'indigo';
                const icon = icons[preferredAudioSource] || 'fa-sliders';
                
                // Actualizar tooltip con información actual
                const duration = CHUNK_DURATION_MS / 60000;
                btnAudioConfig.title = `Fuente: ${getSourceLabel(preferredAudioSource)} | Bloques: ${duration} min | Auto-siguiente: ${autoNextBlock ? 'Sí' : 'No'} | Ganancia: ${formatMicGain(micGainValue)}`;
                
                // Actualizar HTML con color correcto
                btnAudioConfig.innerHTML = `
                    <i class="fa-solid ${icon} text-sm text-${color}-600"></i>
                    <span>Audio settings</span>
                `;
            }


            // Inicializar al cargar la página
            document.addEventListener("DOMContentLoaded", () => {
                // Cargar configuración guardada - PRIORIDAD 1
                const savedBlockMinutes = localStorage.getItem('blockDurationMinutes');
                
                if (savedBlockMinutes) {
                    const min = parseInt(savedBlockMinutes);
                    if (!isNaN(min) && min >= 1) {
                        CHUNK_DURATION_MS = min * 60000;
                    }
                }
                
                // Cargar configuración de compatibilidad
                const savedBlockMinutesOld = localStorage.getItem('blockMinutes');
                if (savedBlockMinutesOld && !savedBlockMinutes) {
                    const min = parseInt(savedBlockMinutesOld);
                    if (!isNaN(min) && min >= 1) {
                        CHUNK_DURATION_MS = min * 60000;
                        localStorage.setItem('blockDurationMinutes', min);
                    }
                }
                
                // Actualizar input del modal
                if (inputBlockMinutes) {
                    inputBlockMinutes.value = CHUNK_DURATION_MS / 60000;
                }
                
                // Cargar preferencia de fuente
                preferredAudioSource = localStorage.getItem('preferredAudioSource') || 'system';
                autoNextBlock = localStorage.getItem('autoNextBlock') !== 'false';
                micGainValue = clampMicGain(parseFloat(localStorage.getItem('micGainValue') || '1'));
                
                // Actualizar UI
                updateAudioConfigButton();
                updateNextBlockButton();
                updateMicGainLabel(micGainValue);
                
                // Configurar checkbox inicial
                const autoNextBlockCheckbox = document.getElementById("autoNextBlock");
                if (autoNextBlockCheckbox) {
                    autoNextBlockCheckbox.checked = autoNextBlock;
                }
                if (inputMicGain) {
                    inputMicGain.value = String(micGainValue);
                }
                
                // Mostrar configuración actual en consola
            });



            function setActiveAITab(tab) {
                document.querySelectorAll('.ai-tab-btn').forEach(b => {
                    b.classList.remove('active-tab', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-300');
                    b.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
                });

                const btn = document.querySelector(`.ai-tab-btn[data-tab="${tab}"]`);
                if (btn) {
                    btn.classList.add('active-tab', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-300');
                    btn.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
                }

                document.querySelectorAll('.ai-tab-content').forEach(content => {
                    content.classList.add('hidden');
                    content.classList.remove('active');
                });
                const tabContent = document.getElementById(`ai-tab-${tab}`);
                if (tabContent) {
                    tabContent.classList.remove('hidden');
                    tabContent.classList.add('active');
                }
            }

            function setAIModalTabsVisibility(mode) {
                const toneBtn = document.getElementById('aiTabToneBtn');
                const toneContent = document.getElementById('ai-tab-tone');
                if (mode === 'multi') {
                    if (toneBtn) toneBtn.classList.add('hidden');
                    if (toneContent) toneContent.classList.add('hidden');
                    setActiveAITab('summary');
                } else {
                    if (toneBtn) toneBtn.classList.remove('hidden');
                }
            }

            function getAiExtraInstructionsKey() {
                return currentSessionId ? `aiSummaryExtra_${currentSessionId}` : "aiSummaryExtra_global";
            }

            function loadAiExtraInstructions() {
                const input = document.getElementById("aiSummaryExtra");
                if (!input) return;
                const saved = localStorage.getItem(getAiExtraInstructionsKey());
                if (saved !== null) input.value = saved;
            }

            function persistAiExtraInstructions() {
                const input = document.getElementById("aiSummaryExtra");
                if (!input) return;
                localStorage.setItem(getAiExtraInstructionsKey(), input.value || "");
            }

            // Función para abrir el modal unificado
            function openAIModal() {
                const hasText = segmentsData.some(
                    s => s.raw && typeof s.raw === 'string' && s.raw.trim().length > 0
                );

                if (!hasText) {
                    showToast("No hay transcripciones para analizar.");
                    return;
                }

                // Resetear contenido
                document.getElementById('aiSummaryResult').innerHTML = `
                    <p class="text-sm text-slate-500">
                        Elige un tipo y pulsa "Generar análisis".
                    </p>
                `;
                
                // 🔥 CONFIGURAR MODO GLOBAL
                window.aiModalMode = 'global';
                window.aiModalBlockId = null;
                window.currentBlockForAI = null;
                window.aiModalSelectedIds = null;
                setAIModalTabsVisibility('global');
                
                // Restaurar títulos originales
                const modalTitle = document.querySelector('#aiModal h3 span');
                const modalSubtitle = document.querySelector('#aiModal p.text-slate-500');
                
                modalTitle.textContent = 'Herramientas de IA';
                modalSubtitle.textContent = 'Cambia el tono del texto o genera resúmenes, análisis y cursos.';
                
                
                // Mostrar modal
                document.getElementById('aiModal').classList.remove('hidden');
                document.getElementById('aiModal').classList.add('flex');

                loadAiExtraInstructions();

                // Cargar análisis guardado del tipo/tono actual (sin generar)
                const type = document.getElementById('aiSummaryType')?.value || 'resumen';
                const tone = document.getElementById('aiSummaryTone')?.value || 'raw';
                generateSessionSummary(type, false, tone, true);
            }


            function openAIModalForBlock(blockId) {
                const segment = segmentsData.find(s => s.id === blockId);
                
                if (!segment || !segment.raw) {
                    showToast("Este bloque no tiene texto para analizar.");
                    return;
                }
                
                // Resetear contenido del modal
                document.getElementById('aiSummaryResult').innerHTML = `
                    <p class="text-sm text-slate-500">
                        Elige un tipo y pulsa "Generar análisis". Este análisis será solo para el bloque actual.
                    </p>
                `;
                
                // Cambiar título para indicar que es solo para este bloque
                const modalTitle = document.querySelector('#aiModal h3 span');
                const modalSubtitle = document.querySelector('#aiModal p.text-slate-500');
                
                // Guardar originales para restaurar luego
                window.modalOriginalTitle = modalTitle.textContent;
                window.modalOriginalSubtitle = modalSubtitle.textContent;
                
                // Actualizar título y subtítulo
                modalTitle.textContent = `Herramientas IA - Bloque #${blockId}`;
                modalSubtitle.textContent = `Cambia el tono o genera análisis para este bloque específico.`;
                
                // 🔥 CONFIGURAR MODO BLOQUE CLARAMENTE
                window.aiModalMode = 'block';
                window.aiModalBlockId = blockId;
                window.aiModalSelectedIds = null;
                setAIModalTabsVisibility('block');
                
                
                // Mostrar modal
                document.getElementById('aiModal').classList.remove('hidden');
                document.getElementById('aiModal').classList.add('flex');

                loadAiExtraInstructions();

                // Cargar análisis guardado del tipo/tono actual (sin generar)
                const type = document.getElementById('aiSummaryType')?.value || 'resumen';
                const tone = document.getElementById('aiSummaryTone')?.value || 'raw';
                generateSessionSummary(type, false, tone, true);
            }

            function openAIModalForMulti(sessionIds) {
                if (!sessionIds || !sessionIds.length) {
                    showToast("Selecciona al menos una sesión.");
                    return;
                }

                document.getElementById('aiSummaryResult').innerHTML = `
                    <p class="text-sm text-slate-500">
                        Elige un tipo y pulsa "Generar análisis". Este análisis combinará las sesiones seleccionadas.
                    </p>
                `;

                const modalTitle = document.querySelector('#aiModal h3 span');
                const modalSubtitle = document.querySelector('#aiModal p.text-slate-500');
                modalTitle.textContent = `Herramientas IA - ${sessionIds.length} sesiones`;
                modalSubtitle.textContent = `Genera resúmenes o análisis combinados de las sesiones seleccionadas.`;

                window.aiModalMode = 'multi';
                window.aiModalBlockId = null;
                window.aiModalSelectedIds = sessionIds;
                setAIModalTabsVisibility('multi');

                document.getElementById('aiModal').classList.remove('hidden');
                document.getElementById('aiModal').classList.add('flex');

                loadAiExtraInstructions();

                // Cargar análisis guardado del tipo/tono actual (sin generar)
                const type = document.getElementById('aiSummaryType')?.value || 'resumen';
                const tone = document.getElementById('aiSummaryTone')?.value || 'raw';
                generateSessionSummary(type, false, tone, true);
            }


            // Modificar la función closeAIModal para restaurar el estado
            function closeAIModal() {
                document.getElementById('aiModal').classList.add('hidden');
                document.getElementById('aiModal').classList.remove('flex');
                setAIModalTabsVisibility('global');
                
                // Restaurar título y subtítulo originales si fueron cambiados
                if (window.modalOriginalTitle) {
                    const modalTitle = document.querySelector('#aiModal h3 span');
                    modalTitle.textContent = window.modalOriginalTitle;
                }
                
                if (window.modalOriginalSubtitle) {
                    const modalSubtitle = document.querySelector('#aiModal p.text-slate-500');
                    modalSubtitle.textContent = window.modalOriginalSubtitle;
                }
                
                // 🔥 LIMPIAR TODAS LAS VARIABLES DE MODO
                window.aiModalMode = null;
                window.aiModalBlockId = null;
                window.aiModalTarget = null;
                window.currentBlockForAI = null;
                window.modalOriginalTitle = null;
                window.modalOriginalSubtitle = null;
            }





            document.getElementById('aiModal').addEventListener('click', (e) => {
                if (e.target === document.getElementById('aiModal')) {
                    closeAIModal();
                }
            });

            if (btnMultiAI) {
                btnMultiAI.addEventListener('click', () => {
                    const ids = Array.from(selectedSessionIds);
                    openAIModalForMulti(ids);
                });
            }

            // 🔧 FUNCIÓN PARA ACTIVAR EDICIÓN DE TEXTO
            function enableBlockEditing(blockId) {
                const segment = segmentsData.find(s => s.id === blockId);
                if (!segment) return;
                
                const blockEl = document.getElementById(`seg-${blockId}`);
                if (!blockEl) return;
                
                // Encontrar el elemento del texto dentro del bloque
                const textContainer = blockEl.querySelector('.prose');
                if (!textContainer) return;
                
                // Obtener el texto actual (considerando el tono activo)
                const tone = selectAction.value;
                const currentText = tone !== "raw" && segment.analyses?.[tone] 
                    ? segment.analyses[tone] 
                    : segment.raw || "";
                
                // Reemplazar el contenido con un textarea editable
                textContainer.innerHTML = `
                    <div class="space-y-3">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-medium text-emerald-700 flex items-center gap-1">
                                <i class="fa-solid fa-pen"></i> Modo edición
                            </span>
                            <div class="flex gap-2">
                                <button class="btn-save-edit text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700 transition-colors" data-id="${blockId}">
                                    <i class="fa-solid fa-check"></i> Guardar
                                </button>
                                <button class="btn-cancel-edit text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded hover:bg-slate-300 transition-colors" data-id="${blockId}">
                                    <i class="fa-solid fa-xmark"></i> Cancelar
                                </button>
                            </div>
                        </div>
                        <textarea id="edit-textarea-${blockId}" 
                            class="w-full h-64 p-4 border border-emerald-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 focus:outline-none resize-y"
                            placeholder="Edita el texto aquí...">${currentText}</textarea>
                        <div class="text-xs text-slate-500 flex items-center gap-2">
                            <i class="fa-solid fa-lightbulb"></i>
                            <span>Edita libremente el texto y guarda los cambios.</span>
                        </div>
                    </div>
                `;
                
                // Hacer scroll y enfocar el textarea
                setTimeout(() => {
                    const textarea = document.getElementById(`edit-textarea-${blockId}`);
                    if (textarea) {
                        textarea.focus();
                        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }

            // 🔧 FUNCIÓN PARA GUARDAR CAMBIOS DE EDICIÓN
            async function saveBlockEdit(blockId) {
                const segment = segmentsData.find(s => s.id === blockId);
                if (!segment) return;
                
                const textarea = document.getElementById(`edit-textarea-${blockId}`);
                if (!textarea) return;
                
                const newText = textarea.value.trim();
                if (!newText) {
                    showToast("❌ El texto no puede estar vacío");
                    return;
                }
                
                const tone = selectAction.value;
                
                // Actualizar según el modo (tono activo o texto original)
                if (tone !== "raw" && segment.analyses) {
                    // Si estamos en un tono específico, actualizar esa versión
                    segment.analyses[tone] = newText;
                    
                    // Si este es el tono activo, también actualizar raw para coherencia
                    if (tone === selectAction.value) {
                        segment.raw = newText;
                    }
                } else {
                    // Modo raw: actualizar texto original
                    segment.raw = newText;
                    segment.original_raw = newText;
                    
                    // También actualizar todos los análisis existentes para mantener consistencia
                    if (segment.analyses) {
                        for (const toneKey in segment.analyses) {
                            segment.analyses[toneKey] = newText;
                        }
                    }
                }
                
                // Guardar en Firebase
                await saveSessionToFirebase();
                
                // Recargar el bloque con el nuevo texto
                renderSegment(segment);
                
                showToast("✅ Texto actualizado correctamente");
            }

            // 🔧 FUNCIÓN PARA CANCELAR EDICIÓN
            function cancelBlockEdit(blockId) {
                const segment = segmentsData.find(s => s.id === blockId);
                if (!segment) return;
                
                // Simplemente recargar el bloque original
                renderSegment(segment);
                showToast("✏️ Edición cancelada");
            }

            // Función para cambiar tabs
            document.querySelectorAll('.ai-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tab = e.target.dataset.tab || e.target.closest('.ai-tab-btn').dataset.tab;
                    
                    // Quitar clase activa de todos los botones
                    document.querySelectorAll('.ai-tab-btn').forEach(b => {
                        b.classList.remove('active-tab', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-300');
                        b.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
                    });
                    
                    // Agregar clase activa al botón clickeado
                    const clickedBtn = e.target.closest('.ai-tab-btn');
                    clickedBtn.classList.add('active-tab', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-300');
                    clickedBtn.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
                    
                    // Ocultar todos los contenidos
                    document.querySelectorAll('.ai-tab-content').forEach(content => {
                        content.classList.add('hidden');
                        content.classList.remove('active');
                    });
                    
                    // Mostrar contenido del tab seleccionado
                    const tabContent = document.getElementById(`ai-tab-${tab}`);
                    if (tabContent) {
                        tabContent.classList.remove('hidden');
                        tabContent.classList.add('active');
                    }
                });
            });
        
            // Event listeners para opciones de tono
            document.querySelectorAll('.tone-option').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const tone = btn.dataset.tone;
                    
                    // 🔥 OBTENER MODO ACTUAL DEL MODAL
                    const currentMode = window.aiModalMode; // 'global' o 'block'
                    const currentBlockId = window.aiModalBlockId;
                    
                    
                    // Guardar preferencia SOLO en modo global
                    if (currentMode === 'global') {
                        localStorage.setItem("lastTone", tone);

                        // Guardar en Firebase si hay sesión activa
                        if (isFirebaseActive && currentSessionId) {
                            await updateDoc(doc(db, "audioTranslate", currentSessionId), {
                                lastTone: tone
                            });
                        }
                    }

                    // Cerrar modal PRIMERO
                    closeAIModal();
                    
                    // ESPERAR un momento para asegurar que el modal se cerró
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    // 🔥 APLICAR TONO SEGÚN EL MODO
                    if (currentMode === 'block' && currentBlockId) {
                        // 🔥 MODO BLOQUE: Aplicar solo al bloque específico
                        
                        // Actualizar el tono actual del bloque
                        const seg = segmentsData.find(s => s.id === currentBlockId);
                        if (seg) {
                            seg.currentTone = tone;
                        }
                        
                        if (tone === "raw") {
                            renderSegment(seg);
                            await saveSessionToFirebase();
                            return;
                        }

                        await generateToneForSegment(currentBlockId, tone);
                    } else {
                        // 🔥 MODO GLOBAL: Aplicar a todos los bloques
                        
                        // Actualizar el tono actual en todos los bloques
                        segmentsData.forEach(seg => {
                            if (seg.status === "done" && seg.raw) {
                                seg.currentTone = tone;
                            }
                        });

                        if (tone === "raw") {
                            resetToOriginalTone();
                            await saveSessionToFirebase();
                            return;
                        }

                        await applyToneToAllBlocks(tone);
                    }
                });
            });




        
            // -----------------------------------------------------------
            // EVENT LISTENER PARA SELECTOR DE TIPO DE ANÁLISIS
            // -----------------------------------------------------------
            document.getElementById('aiSummaryType').addEventListener('change', async (e) => {
                const type = e.target.value;
                const tone = document.getElementById('aiSummaryTone').value || 'raw';
                document.getElementById('aiSummaryResult').innerHTML = `
                    <div class="flex items-center gap-2 text-slate-500 text-sm">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>Listo para generar: "${type}" (${getActionLabel(tone)}). Pulsa "Generar análisis".</span>
                    </div>
                `;
                generateSessionSummary(type, false, tone, true);
            });

            document.getElementById('aiSummaryTone').addEventListener('change', async (e) => {
                const tone = e.target.value || 'raw';
                const type = document.getElementById('aiSummaryType').value;
                document.getElementById('aiSummaryResult').innerHTML = `
                    <div class="flex items-center gap-2 text-slate-500 text-sm">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>Listo para generar: "${type}" (${getActionLabel(tone)}). Pulsa "Generar análisis".</span>
                    </div>
                `;
                generateSessionSummary(type, false, tone, true);
            });

            const aiSummaryExtraInput = document.getElementById('aiSummaryExtra');
            if (aiSummaryExtraInput) {
                aiSummaryExtraInput.addEventListener('input', () => {
                    persistAiExtraInstructions();
                });
                aiSummaryExtraInput.addEventListener('blur', () => {
                    persistAiExtraInstructions();
                });
            }

            // -----------------------------------------------------------
            // EVENT LISTENER PARA BOTÓN GENERAR
            // -----------------------------------------------------------
            document.getElementById('btnGenerateSummary').addEventListener('click', () => {
                const type = document.getElementById('aiSummaryType').value;
                const tone = document.getElementById('aiSummaryTone').value || 'raw';
                generateSessionSummary(type, true, tone); // true = regenerar siempre al hacer click
            });

            function getSummaryTypeLabel(type) {
                const labels = {
                    resumen: "Resumen general",
                    analisis: "Análisis crítico",
                    sintesis: "Síntesis ejecutiva",
                    curso: "Propuesta de curso",
                    ideas: "Ideas clave y tareas",
                    audiolibro: "Audiolibro"
                };
                return labels[type] || type;
            }

            async function saveAnalysisToFirebase(content, type, tone, model) {
                if (!isFirebaseActive || !currentSessionId) {
                    showToast("No hay sesión activa.");
                    return false;
                }
                const user = auth.currentUser;
                if (currentSessionOwnerId && user && currentSessionOwnerId !== user.uid) {
                    showToast("No puedes guardar en una sesión que no es tuya.");
                    return false;
                }
                const toneKey = tone && tone !== "raw" ? `${type}_${tone}` : type;
                try {
                    const estimatedBytes = new TextEncoder().encode(content).length;
                    const analysisRef = doc(collection(db, "audioTranslateAnalyses"));
                    let payload = {
                        sessionId: currentSessionId,
                        type,
                        tone,
                        model,
                        toneKey,
                        sizeBytes: estimatedBytes,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };

                    if (estimatedBytes < 400_000) {
                        payload.content = content;
                    } else {
                        const path = `analyses/${currentSessionId}/${toneKey}-${model}-${Date.now()}.txt`;
                        const ref = storageRef(storage, path);
                        await uploadBytes(ref, new Blob([content], { type: "text/plain" }));
                        const url = await getDownloadURL(ref);
                        payload.url = url;
                        payload.storagePath = path;
                    }

                    await setDoc(analysisRef, payload);
                    await updateDoc(doc(db, "audioTranslate", currentSessionId), {
                        [`analysisRefs.${toneKey}.${model}`]: analysisRef.id,
                        lastUpdated: serverTimestamp()
                    }, { merge: true });
                    return true;
                } catch (e) {
                    console.error("Error guardando análisis:", {
                        message: e?.message || e,
                        sessionId: currentSessionId,
                        type,
                        tone,
                        model,
                        toneKey,
                        isFirebaseActive,
                        hasUser: !!user,
                        ownerId: currentSessionOwnerId
                    });
                    showToast("Error guardando análisis.");
                    return false;
                }
            }

            async function buildSavedAnalysesList() {
                const listEl = document.getElementById("savedAnalysesList");
                if (!listEl) return;
                listEl.innerHTML = `<div class="text-sm text-slate-500">Cargando análisis guardados...</div>`;

                const items = [];
                if (isFirebaseActive && currentSessionId) {
                    try {
                        const q = query(collection(db, "audioTranslateAnalyses"), where("sessionId", "==", currentSessionId));
                        const snap = await getDocs(q);
                        snap.forEach(docSnap => {
                            const d = docSnap.data() || {};
                            if (!d.type) return;
                            items.push({
                                id: docSnap.id,
                                type: d.type,
                                tone: d.tone || "raw",
                                model: d.model || "",
                                createdAt: d.createdAt
                            });
                        });
                    } catch (e) {
                    }
                    try {
                        const q = query(collection(db, "audioTranslateSummaries"), where("sessionId", "==", currentSessionId));
                        const snap = await getDocs(q);
                        snap.forEach(docSnap => {
                            const d = docSnap.data() || {};
                            if (!d.type) return;
                            const tone = d.tone || "raw";
                            const key = tone !== "raw" ? `${d.type}_${tone}` : d.type;
                            items.push({
                                type: d.type,
                                tone,
                                model: d.model || "",
                                key
                            });
                        });
                    } catch (e) {
                    }
                }

                if (!items.length) {
                    listEl.innerHTML = `<div class="text-sm text-slate-500">No hay análisis guardados.</div>`;
                    return;
                }

                listEl.innerHTML = "";
                items.forEach(item => {
                    const row = document.createElement("div");
                    row.className = "flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3";
                    const info = document.createElement("div");
                    info.className = "min-w-0";
                    const title = document.createElement("div");
                    title.className = "text-sm font-medium text-slate-800";
                    title.textContent = getSummaryTypeLabel(item.type);
                    const meta = document.createElement("div");
                    meta.className = "text-xs text-slate-500";
                    meta.textContent = `Tono: ${getActionLabel(item.tone)} · Modelo: ${String(item.model || "N/A")}`;
                    info.append(title, meta);

                    const button = document.createElement("button");
                    button.className = "btn-view-saved text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors";
                    button.type = "button";
                    button.dataset.id = String(item.id || "");
                    button.dataset.type = String(item.type || "");
                    button.dataset.tone = String(item.tone || "");
                    button.textContent = "Ver";
                    row.append(info, button);
                    listEl.appendChild(row);
                });
            }

            const savedAnalysesModal = document.getElementById("savedAnalysesModal");
            const btnCloseSavedAnalyses = document.getElementById("btnCloseSavedAnalyses");
            const btnViewSavedAnalyses = document.getElementById("btnViewSavedAnalyses");
            const btnSaveAnalysis = document.getElementById("btnSaveAnalysis");

            if (btnViewSavedAnalyses && savedAnalysesModal) {
                btnViewSavedAnalyses.addEventListener("click", async () => {
                    savedAnalysesModal.classList.remove("hidden");
                    savedAnalysesModal.classList.add("flex");
                    await buildSavedAnalysesList();
                });
            }
            if (btnCloseSavedAnalyses && savedAnalysesModal) {
                btnCloseSavedAnalyses.addEventListener("click", () => {
                    savedAnalysesModal.classList.add("hidden");
                    savedAnalysesModal.classList.remove("flex");
                });
            }
            if (savedAnalysesModal) {
                savedAnalysesModal.addEventListener("click", (e) => {
                    if (e.target === savedAnalysesModal) {
                        savedAnalysesModal.classList.add("hidden");
                        savedAnalysesModal.classList.remove("flex");
                    }
                    const viewBtn = e.target.closest(".btn-view-saved");
                    if (viewBtn) {
                        const type = viewBtn.dataset.type;
                        const tone = viewBtn.dataset.tone || "raw";
                        const docId = viewBtn.dataset.id;
                        const typeSelect = document.getElementById("aiSummaryType");
                        const toneSelect = document.getElementById("aiSummaryTone");
                        if (typeSelect) typeSelect.value = type;
                        if (toneSelect) toneSelect.value = tone;
                        savedAnalysesModal.classList.add("hidden");
                        savedAnalysesModal.classList.remove("flex");
                        if (docId) {
                            (async () => {
                                try {
                                    const snap = await getDoc(doc(db, "audioTranslateAnalyses", docId));
                                    if (snap.exists()) {
                                        const d = snap.data() || {};
                                        let content = d.content || "";
                                        if (!content && d.url) {
                                            const res = await fetch(d.url, { cache: "no-store" });
                                            if (res.ok) content = await res.text();
                                        }
                                        if (content) {
                                            renderAssistantSummaryResult(content);
                                            window.lastGeneratedAnalysis = {
                                                type: d.type || type,
                                                tone: d.tone || tone,
                                                model: d.model || selectGeminiEndpoint.value,
                                                content
                                            };
                                            return;
                                        }
                                    }
                                } catch (e) {
                                }
                                generateSessionSummary(type, false, tone, true);
                            })();
                        } else {
                            generateSessionSummary(type, false, tone, true);
                        }
                    }
                });
            }

            if (btnSaveAnalysis) {
                btnSaveAnalysis.addEventListener("click", async () => {
                    const type = document.getElementById('aiSummaryType')?.value || 'resumen';
                    const tone = document.getElementById('aiSummaryTone')?.value || 'raw';
                    const model = selectGeminiEndpoint?.value || "";
                    const last = window.lastGeneratedAnalysis;
                    let content = last && last.content ? last.content : "";
                    if (!content) {
                        const summaryEl = document.querySelector('#aiSummaryResult .prose');
                        const audioEl = document.getElementById('audiobookText');
                        if (audioEl && audioEl.textContent) content = audioEl.textContent.trim();
                        else if (summaryEl && summaryEl.textContent) content = summaryEl.textContent.trim();
                    }
                    if (!content) {
                        showToast("No hay análisis para guardar.");
                        return;
                    }
                    const ok = await saveAnalysisToFirebase(content, type, tone, model);
                    if (ok) {
                        showToast("✅ Análisis guardado.");
                    }
                });
            }

            // === CHAT IA MODAL ===
            const btnOpenChatIA = document.getElementById("btnOpenChatIA");
            const chatIAModal = document.getElementById("chatIAModal");
            const btnCloseChatIA = document.getElementById("btnCloseChatIA");
            const btnClearChatIA = document.getElementById("btnClearChatIA");
            const chatIAContent = document.getElementById("chatIAContent");
            const chatIAInput = document.getElementById("chatIAInput");
            const btnSendChatIA = document.getElementById("btnSendChatIA");
            const chatModalTitleEl = document.querySelector("#chatIAModal h3");
            const defaultChatModalTitle = chatModalTitleEl ? chatModalTitleEl.innerHTML : "";
            let chatIAContext = { mode: "single", key: null, sessionIds: [] };
            const multiSessionTextCache = new Map();

            function buildMultiChatKey(sessionIds) {
                return `multi:${[...new Set(sessionIds)].sort().join(",")}`;
            }

            function getSessionTitleById(sessionId) {
                const found = sessionsIndex.find(s => s.id === sessionId);
                return found?.title || `Sesión ${sessionId}`;
            }

            function getSegmentRichness(seg) {
                if (!seg || typeof seg !== "object") return 0;
                let score = 0;
                const raw = (seg.raw || seg.text || seg.transcript || "").toString();
                score += raw.length;
                if (seg.analyses && typeof seg.analyses === "object") {
                    for (const val of Object.values(seg.analyses)) {
                        if (typeof val === "string") score += val.length;
                    }
                }
                const voces = seg.analisis_voces?.transcripcion_estructurada;
                if (Array.isArray(voces)) {
                    score += voces.join(" ").length;
                }
                return score;
            }

            function mergeSegmentsSources(...sources) {
                const mergedById = new Map();
                const normalizeSegmentForContext = (seg, idx) => {
                    if (typeof seg === "string") {
                        const text = seg.trim();
                        if (!text) return null;
                        return {
                            id: idx + 1,
                            raw: text,
                            analyses: {}
                        };
                    }
                    if (!seg || typeof seg !== "object") return null;
                    const out = { ...seg };
                    if (!out.raw && typeof out.text === "string") out.raw = out.text;
                    if (!out.raw && typeof out.transcript === "string") out.raw = out.transcript;
                    if (!out.raw && typeof out.original_raw === "string") out.raw = out.original_raw;
                    const parsedId = Number(out.id);
                    if (!Number.isFinite(parsedId)) out.id = idx + 1;
                    else out.id = parsedId;
                    return out;
                };

                const pickLongerText = (a, b) => {
                    const ta = typeof a === "string" ? a : "";
                    const tb = typeof b === "string" ? b : "";
                    return tb.length > ta.length ? tb : ta;
                };

                const mergeTwoSegments = (baseSeg, incomingSeg) => {
                    const base = baseSeg && typeof baseSeg === "object" ? baseSeg : {};
                    const incoming = incomingSeg && typeof incomingSeg === "object" ? incomingSeg : {};
                    const out = { ...base, ...incoming };

                    out.raw = pickLongerText(base.raw, incoming.raw);
                    out.text = pickLongerText(base.text, incoming.text);
                    out.transcript = pickLongerText(base.transcript, incoming.transcript);
                    out.original_raw = pickLongerText(base.original_raw, incoming.original_raw);

                    const baseAnalyses = (base.analyses && typeof base.analyses === "object") ? base.analyses : {};
                    const incomingAnalyses = (incoming.analyses && typeof incoming.analyses === "object") ? incoming.analyses : {};
                    const mergedAnalyses = { ...baseAnalyses };
                    for (const [k, v] of Object.entries(incomingAnalyses)) {
                        if (!mergedAnalyses[k]) {
                            mergedAnalyses[k] = v;
                        } else if (typeof v === "string" && v.length > String(mergedAnalyses[k] || "").length) {
                            mergedAnalyses[k] = v;
                        }
                    }
                    if (Object.keys(mergedAnalyses).length) {
                        out.analyses = mergedAnalyses;
                    }

                    const baseVoices = base.analisis_voces?.transcripcion_estructurada;
                    const incomingVoices = incoming.analisis_voces?.transcripcion_estructurada;
                    if (Array.isArray(baseVoices) || Array.isArray(incomingVoices)) {
                        const b = Array.isArray(baseVoices) ? baseVoices : [];
                        const i = Array.isArray(incomingVoices) ? incomingVoices : [];
                        out.analisis_voces = {
                            ...(base.analisis_voces || {}),
                            ...(incoming.analisis_voces || {}),
                            transcripcion_estructurada: i.length > b.length ? i : b
                        };
                    }

                    return out;
                };

                sources.forEach((list, sourceIdx) => {
                    const segments = Array.isArray(list) ? list : [];
                    segments.forEach((rawSeg, idx) => {
                        const seg = normalizeSegmentForContext(rawSeg, idx);
                        if (!seg) return;
                        const key = seg.id != null ? `id:${seg.id}` : `tmp:${sourceIdx}:${idx}`;
                        if (!mergedById.has(key)) {
                            mergedById.set(key, { ...seg });
                        } else {
                            const prev = mergedById.get(key);
                            mergedById.set(key, mergeTwoSegments(prev, seg));
                        }
                    });
                });

                return Array.from(mergedById.values()).sort((a, b) => {
                    const ta = Number(a?.timestamp || 0);
                    const tb = Number(b?.timestamp || 0);
                    if (ta !== tb) return ta - tb;
                    return Number(a?.id || 0) - Number(b?.id || 0);
                });
            }

            function segmentToReadableText(seg, index = 0, contextNote = "") {
                if (!seg || typeof seg !== "object") return "";
                const headerId = seg.id ?? (index + 1);
                const partes = [];

                const raw = (seg.raw || seg.text || seg.transcript || "").toString().trim();
                if (raw) {
                    partes.push(`Texto del bloque:\n${raw}`);
                }

                if (seg.analyses && typeof seg.analyses === "object") {
                    const analysesEntries = Object.entries(seg.analyses)
                        .filter(([_, value]) => typeof value === "string" && value.trim());
                    if (analysesEntries.length) {
                        const analysesText = analysesEntries
                            .map(([tone, value]) => `- ${tone}: ${value}`)
                            .join("\n");
                        partes.push(`Análisis del bloque por tono:\n${analysesText}`);
                    }
                }

                const structuredVoices = seg.analisis_voces?.transcripcion_estructurada;
                if (Array.isArray(structuredVoices) && structuredVoices.length) {
                    partes.push(`Diálogo estructurado:\n${structuredVoices.join("\n")}`);
                }

                const noteText = typeof contextNote === "string" ? contextNote.trim() : "";
                if (noteText) {
                    partes.push(`Nota de contexto del bloque:\n${noteText}`);
                }

                if (!partes.length) return "";
                return `Bloque ${headerId}\n${partes.join("\n\n")}`;
            }

            async function getSessionContextText(sessionId) {
                if (!sessionId) return "";

                if (sessionId === currentSessionId && Array.isArray(segmentsData) && segmentsData.length) {
                    const notesMap = { ...blockContextNotes };
                    return segmentsData
                        .map((seg, idx) => segmentToReadableText(seg, idx, notesMap[String(seg.id)] || ""))
                        .filter(Boolean)
                        .join("\n\n");
                }

                if (!isFirebaseActive) return "";

                try {
                    const snap = await getDoc(doc(db, "audioTranslate", sessionId));
                    if (!snap.exists()) return "";

                    const data = snap.data() || {};
                    const segmentsFromDoc = normalizeSegments(data.segments);
                    const segmentsFromRoot = extractSegmentsFromSessionDoc(data);
                    const segmentsFromStorage = await loadSegmentsFromStorage(sessionId);
                    const segments = mergeSegmentsSources(
                        segmentsFromDoc,
                        segmentsFromRoot,
                        segmentsFromStorage
                    );
                    const notesMap = await fetchContextNotesMapForSession(sessionId);

                    return (segments || [])
                        .map((seg, idx) => segmentToReadableText(seg, idx, notesMap[String(seg.id)] || ""))
                        .filter(Boolean)
                        .join("\n\n");
                } catch (err) {
                    return "";
                }
            }

            async function getMultiSessionContextText(sessionIds) {
                const ids = [...new Set(sessionIds || [])].filter(Boolean);
                const key = buildMultiChatKey(ids);
                if (multiSessionTextCache.has(key)) {
                    return multiSessionTextCache.get(key);
                }

                const MAX_TOTAL_CHARS = 65000;
                const MAX_PER_SESSION = 12000;
                const MIN_SESSION_SLOT = 180;
                const sessionSeparator = "\n\n==========\n\n";
                const approxHeaderPerSession = 80;

                const trimSessionContent = (text, maxChars) => {
                    const raw = (text || "").trim();
                    if (!raw || raw.length <= maxChars) return raw;
                    const cut = raw.slice(0, maxChars);
                    const lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
                    const safeCut = lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
                    return `${safeCut}\n\n[Sesión truncada por longitud]`;
                };

                const sessionEntries = await Promise.all(ids.map(async (id) => {
                    const title = getSessionTitleById(id);
                    const content = await getSessionContextText(id);
                    return { id, title, content: (content || "").trim() };
                }));

                const summaryLines = sessionEntries.map((entry) => {
                    if (!entry.content) return `- ${entry.title} (${entry.id}): sin contenido disponible`;
                    const blockCount = (entry.content.match(/\bBloque\s+\d+/g) || []).length;
                    const blocksLabel = blockCount ? `${blockCount} bloques` : "contenido detectado";
                    return `- ${entry.title} (${entry.id}): ${blocksLabel}`;
                });
                const summaryHeader = `SESIONES INCLUIDAS (${sessionEntries.length}):\n${summaryLines.join("\n")}\n\n`;

                let remaining = Math.max(0, MAX_TOTAL_CHARS - summaryHeader.length);
                const parts = [];

                sessionEntries.forEach((entry, index) => {
                    const sessionsLeft = sessionEntries.length - index;
                    const reservedSeparators = (sessionsLeft - 1) * sessionSeparator.length;
                    const reservedHeaders = sessionsLeft * approxHeaderPerSession;
                    const freeBudget = Math.max(0, remaining - reservedSeparators - reservedHeaders);
                    const fairShare = Math.floor(freeBudget / Math.max(sessionsLeft, 1));
                    const contentLimit = Math.max(MIN_SESSION_SLOT, Math.min(MAX_PER_SESSION, fairShare));

                    const header = `[${entry.title} | ${entry.id}]\n`;
                    let body = entry.content
                        ? trimSessionContent(entry.content, contentLimit)
                        : "[Sin contenido textual recuperable para esta sesión]";

                    let section = `${header}${body}`;
                    const maxSectionLength = Math.max(
                        header.length + MIN_SESSION_SLOT,
                        remaining - reservedSeparators - ((sessionsLeft - 1) * approxHeaderPerSession)
                    );

                    if (section.length > maxSectionLength) {
                        const maxBody = Math.max(MIN_SESSION_SLOT, maxSectionLength - header.length);
                        body = trimSessionContent(body, maxBody);
                        section = `${header}${body}`;
                    }

                    parts.push(section);
                    remaining = Math.max(0, remaining - section.length);
                    if (index < sessionEntries.length - 1) {
                        remaining = Math.max(0, remaining - sessionSeparator.length);
                    }
                });

                let fullContext = `${summaryHeader}${parts.join(sessionSeparator)}`;
                if (fullContext.length > MAX_TOTAL_CHARS) {
                    fullContext = `${fullContext.slice(0, MAX_TOTAL_CHARS)}\n\n[Contenido truncado por longitud]`;
                }

                multiSessionTextCache.set(key, fullContext);
                return fullContext;
            }

            function openChatModalForContext(mode, sessionIds) {
                const ids = [...new Set(sessionIds || [])].filter(Boolean);
                if (!ids.length) {
                    showToast("Selecciona al menos una sesión.");
                    return;
                }

                const key = mode === "multi" ? buildMultiChatKey(ids) : ids[0];
                if (mode === "multi") {
                    multiSessionTextCache.delete(key);
                }
                chatIAContext = { mode, key, sessionIds: ids };

                if (!chatHistory[key]) {
                    chatHistory[key] = [];
                }

                if (chatModalTitleEl) {
                    if (mode === "multi") {
                        chatModalTitleEl.innerHTML = `
                            <i class="fa-solid fa-comments text-amber-500"></i>
                            Chat con Charly (${ids.length} sesiones)
                        `;
                    } else {
                        chatModalTitleEl.innerHTML = defaultChatModalTitle;
                    }
                }

                chatIAInput.placeholder = mode === "multi"
                    ? "Pregunta sobre las sesiones seleccionadas..."
                    : "Escribe tu pregunta...";

                chatIAModal.classList.remove("hidden");
                chatIAModal.classList.add("flex");
                renderChatHistory(key);
            }

            btnOpenChatIA.addEventListener("click", () => {
                if (!currentSessionId) {
                    showToast("Primero inicia o selecciona una sesión.");
                    return;
                }
                openChatModalForContext("single", [currentSessionId]);
            });

            if (btnMultiChatIA) {
                btnMultiChatIA.addEventListener("click", () => {
                    const ids = Array.from(selectedSessionIds);
                    openChatModalForContext("multi", ids);
                });
            }


            btnCloseChatIA.addEventListener("click", () => {
                chatIAModal.classList.add("hidden");
                chatIAModal.classList.remove("flex");
            });

            btnClearChatIA.addEventListener("click", async () => {
                const activeKey = chatIAContext?.key;
                if (!activeKey) {
                    showToast("No hay chat activo.");
                    return;
                }

                const isMultiMode = chatIAContext.mode === "multi";
                const confirmClear = confirm(
                    isMultiMode
                        ? "¿Seguro que quieres limpiar el chat de las sesiones seleccionadas?"
                        : "¿Seguro que quieres limpiar el chat de esta sesión?"
                );
                if (!confirmClear) return;

                chatHistory[activeKey] = [];
                chatIAInput.value = "";
                renderChatHistory(activeKey);

                const singleSessionId = !isMultiMode ? chatIAContext.sessionIds[0] : null;
                if (!isMultiMode && isFirebaseActive && singleSessionId) {
                    try {
                        const sessionRef = doc(db, "audioTranslate", singleSessionId);
                        await updateDoc(sessionRef, {
                            chatIA: [],
                            lastUpdated: serverTimestamp()
                        });
                    } catch (error) {
                        showToast("No se pudo limpiar el chat en Firebase.");
                    }
                }
            });

            chatIAModal.addEventListener("click", (e) => {
                if (e.target === chatIAModal) {
                    chatIAModal.classList.add("hidden");
                    chatIAModal.classList.remove("flex");
                }
            });

            btnSendChatIA.addEventListener("click", async () => {
                const question = chatIAInput.value.trim();
                if (!question || !chatIAContext?.key) return;
                chatIAInput.value = "";

                const activeKey = chatIAContext.key;
                const isMultiMode = chatIAContext.mode === "multi";

                // Asegurar que exista el array de historial
                if (!chatHistory[activeKey]) chatHistory[activeKey] = [];

                // Guardar y renderizar mensaje del usuario
                chatHistory[activeKey].push({ 
                    role: "user", 
                    text: question,
                    timestamp: new Date().toISOString()
                });
                appendChatBubble("user", question, null);

                // Mostrar indicador de carga
                const loading = appendChatBubble("loading", "Pensando...");

                try {
                    // Construir contexto según modo del chat
                    let fullText = "";
                    if (isMultiMode) {
                        fullText = await getMultiSessionContextText(chatIAContext.sessionIds);
                    } else {
                        fullText = await getSessionContextText(chatIAContext.sessionIds[0]);
                    }

                    if (!fullText.trim()) {
                        loading.remove();
                        showToast("No hay contenido disponible en las sesiones seleccionadas.");
                        return;
                    }

                    const contextoLabel = isMultiMode
                        ? "SESIONES SELECCIONADAS"
                        : "SESIÓN ACTUAL";

                    const localPrompt = `
                    Eres Charly. Responde con claridad y precisión usando PRIORITARIAMENTE el contexto local.
                    Debes considerar TODAS las sesiones incluidas en el contexto.
                    Las notas de contexto por bloque tienen prioridad para interpretar intención y matices.
                    Si la información local es insuficiente para ejemplos prácticos, indícalo brevemente.
                    CONTENIDO (${contextoLabel}):
                    """${fullText}"""

                    PREGUNTA:
                    "${question}"

                    Responde en español natural y conciso.`;

                    let respuesta = await fetchGeminiTextOnly(localPrompt);
                    let sourceTag = "local";
                    const needsExamples = /ejemplos?\s+pr[aá]ctic/i.test(question);
                    const localInsufficient = isInsufficientLocalAnswer(respuesta);

                    if (localInsufficient || (needsExamples && isWeakExampleAnswer(respuesta))) {
                        const modelPrompt = `
                            Eres Charly. Responde con tu conocimiento general cuando no haya suficiente contexto local.
                            Sé práctico, claro y en español.
                            Si das ejemplos, darlos paso a paso.
                            PREGUNTA: "${question}"`;
                        respuesta = await fetchGeminiTextOnly(modelPrompt);
                        sourceTag = "model";
                    }

                    // Guardar respuesta
                    chatHistory[activeKey].push({ 
                        role: "assistant", 
                        text: respuesta,
                        source: sourceTag,
                        timestamp: new Date().toISOString()
                    });

                    // Actualizar UI
                    loading.remove();
                    appendChatBubble("assistant", respuesta, sourceTag);

                    // 🔥 GUARDAR EN FIREBASE
                    const singleSessionId = !isMultiMode ? chatIAContext.sessionIds[0] : null;
                    if (!isMultiMode && isFirebaseActive && singleSessionId) {
                        try {
                            const sessionRef = doc(db, "audioTranslate", singleSessionId);
                            await updateDoc(sessionRef, {
                                chatIA: chatHistory[activeKey],
                                lastUpdated: serverTimestamp()
                            });
                        } catch (error) {
                        }
                    }

                } catch (err) {
                    loading.textContent = "❌ Error al obtener respuesta.";
                    loading.className = "text-red-500 text-sm italic px-4 py-2";
                }
            });


            // Input multilinea: Enter crea salto; Ctrl/Cmd+Enter envia.
            chatIAInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    btnSendChatIA.click();
                }
            });


            function fixInvalidSegmentIds() {
                const used = new Set();
                let maxId = 0;

                for (const seg of segmentsData) {
                    // Normalizar IDs numéricos en string
                    if (typeof seg.id === "string" && /^\d+$/.test(seg.id)) {
                        seg.id = Number(seg.id);
                    }

                    if (typeof seg.id === "number" && seg.id > 0 && !Number.isNaN(seg.id) && !used.has(seg.id)) {
                        used.add(seg.id);
                        if (seg.id > maxId) maxId = seg.id;
                    } else {
                        // Marcar como inválido para reasignar luego
                        seg.id = null;
                    }
                }

                for (const seg of segmentsData) {
                    if (typeof seg.id !== "number" || seg.id <= 0 || Number.isNaN(seg.id)) {
                        let nextId = maxId + 1;
                        while (used.has(nextId)) nextId++;
                        seg.id = nextId;
                        used.add(nextId);
                        maxId = nextId;
                    }
                }
            }


            // Renderiza historial de chat de una sesión
            function renderChatHistory(sessionId) {
                chatIAContent.innerHTML = "";

                const history = chatHistory[sessionId] || [];
                
                if (history.length === 0) {
                    const emptyMessage = chatIAContext.mode === "multi"
                        ? "Pregunta libremente sobre las sesiones seleccionadas."
                        : "Pregunta libremente sobre el contenido de los bloques.";
                    chatIAContent.innerHTML = `
                        <div class="text-sm text-slate-500 italic text-center mt-10">
                            💬 ${emptyMessage}
                        </div>`;
                    return;
                }

                // Ordenar por timestamp si está disponible
                const sortedHistory = history.sort((a, b) => {
                    if (a.timestamp && b.timestamp) {
                        return new Date(a.timestamp) - new Date(b.timestamp);
                    }
                    return 0;
                });

                sortedHistory.forEach(msg => appendChatBubble(msg.role, msg.text, msg.source || null));
                chatIAContent.scrollTop = chatIAContent.scrollHeight;
            }


            // Crea y añade burbuja al chat
            function sourceBadgeHtml(source) {
                if (!source) return "";
                const src = String(source).toLowerCase();
                if (src === "local") return `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Fuente: Local</span>`;
                if (src === "model") return `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Fuente: Modelo IA</span>`;
                return "";
            }

            function sanitizeAssistantBubbleHtml(value = "") {
                return sanitizeAssistantHtml(String(value || ""));
            }

            function renderAssistantSummaryResult(content = "") {
                const summaryRoot = document.getElementById('aiSummaryResult');
                if (!summaryRoot) return;
                const safeContent = sanitizeAssistantBubbleHtml(formatText(content));
                setSanitizedHtml(summaryRoot, `
                    <div class="prose prose-sm max-w-none text-slate-800 border-t border-slate-200 pt-4">
                        ${safeContent}
                    </div>
                `);
            }

            function appendChatBubble(role, text, source = null) {
                const div = document.createElement("div");

                if (role === "user") {
                    div.className = "bg-amber-100 text-slate-800 px-4 py-2 rounded-lg self-end ml-auto max-w-[80%]";
                    div.textContent = text;
                } else if (role === "assistant") {
                    div.className = "bg-white border border-slate-200 text-slate-800 px-4 pt-6 pb-2 rounded-lg shadow-sm max-w-[80%] relative";
                    div.innerHTML = `
                        <div class="chat-bubble-header -mx-4 -mt-6 mb-2 px-4 pt-6 pb-2 border-b border-slate-200 flex items-center justify-between gap-3">
                            <div class="flex items-center gap-2 min-w-0">
                                <i class="fa-solid fa-robot text-indigo-600 text-xs"></i>
                                <span class="text-xs font-semibold text-slate-700">Charly</span>
                                ${sourceBadgeHtml(source)}
                            </div>
                            <button class="btn-download-chat-response text-slate-400 hover:text-indigo-600 p-1 rounded shrink-0" title="Descargar en Word">
                                <i class="fa-solid fa-file-word text-sm"></i>
                            </button>
                        </div>
                        <div class="chat-bubble-content pt-1 pb-2">
                            ${sanitizeAssistantBubbleHtml(formatText(text))}
                        </div>
                    `;
                    const btn = div.querySelector(".btn-download-chat-response");
                    if (btn) {
                        btn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            exportChatResponseToWord(text);
                        });
                    }
                } else if (role === "loading") {
                    div.className = "text-slate-500 text-sm italic px-4 py-2";
                    div.textContent = text;
                }

                chatIAContent.appendChild(div);
                chatIAContent.scrollTop = chatIAContent.scrollHeight;
                return div;
            }

            function isInsufficientLocalAnswer(answerText) {
                const t = String(answerText || "").toLowerCase();
                if (!t.trim()) return true;
                return (
                    /no\s+(encontr|dispongo|cuento|tengo)\s+(informaci[oó]n|datos|contenido)/i.test(t) ||
                    /no\s+aparece\s+en\s+el\s+contenido/i.test(t) ||
                    /informaci[oó]n\s+insuficiente/i.test(t) ||
                    /no\s+hay\s+contenido/i.test(t)
                );
            }

            function isWeakExampleAnswer(answerText) {
                const t = String(answerText || "").trim();
                if (!t) return true;
                // Respuesta muy corta ante solicitud de ejemplos prácticos.
                return t.length < 120;
            }

            function exportChatResponseToWord(text) {
                if (!text || !text.trim()) {
                    showToast("No hay contenido para exportar.");
                    return;
                }
                const html = `<div>${formatText(text)}</div>`;
                const doc = window.htmlDocx.asBlob(html, { orientation: "portrait" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(doc);
                const now = new Date();
                link.download = `Chat-Charly-${now.getHours()}${now.getMinutes()}.docx`;
                link.click();
                showToast("Respuesta exportada en Word");
            }



            btnNextBlock.addEventListener('click', stopAndStartNewBlock);



            document.addEventListener("DOMContentLoaded", async () => {
                const lastId = localStorage.getItem("lastSessionId");
                if (lastId) {
                    const ref = doc(db, "audioTranslate", lastId);
                    const snap = await getDoc(ref);
                    if (snap.exists()) {
                        loadSession(lastId, snap.data());
                    }
                }

                const pending = await loadPendingAudios();

                if (pending.length > 0) {
                    showToast("Recuperando bloques pendientes...");

                    // 1️⃣ Si no hay sesión activa, intenta cargar la última sesión
                    if (!currentSessionId) {
                        const last = await loadLastSessionFromFirebase();
                        if (last) {
                            currentSessionId = last.id;
                            segmentsData = last.data.segments || [];
                            currentSessionTitle.textContent = last.data.title || "Sesión restaurada";
                            sessionFeed.innerHTML = "";
                            segmentsData.forEach(s => renderSegment(s));
                            emptyState.classList.add("hidden");
                        } else {
                            // 2️⃣ Si no existe sesión previa, crea una nueva
                            await createNewSession();
                        }
                    }

                    // 3️⃣ Procesar cada bloque pendiente dentro de la sesión actual
                    for (const item of pending) {
                        const { id, audio } = item;

                        if (!segmentsData.find(s => s.id === id)) {
                            let validId = id;

                            if (!validId || typeof validId !== "number") {
                                validId = Math.max(0, ...segmentsData.map(s => s.id || 0)) + 1;
                            }

                            segmentsData.push({
                                id: validId,
                                timestamp: Date.now(),
                                raw: null,
                                analyses: {},
                                status: "processing"
                            });

                            renderSegment(segmentsData.find(s => s.id === validId));
                        }

                        await processAudioWithGemini(audio, id, "audio/webm");
                    }

                    showToast("✅ Bloques pendientes procesados correctamente.");

                    // 🔥 Restaurar grabación si la pestaña se reinició durante una sesión activa
                    if (!isRecording) {
                        try {
                            const devices = await navigator.mediaDevices.enumerateDevices();
                            const hasMic = devices.some(d => d.kind === "audioinput");

                            if (hasMic) {
                                globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            }

                            if (globalStream) {
                                isRecording = true;
                                updateUIState(true);
                                updateStatus("Grabación restaurada tras reinicio");
                                emptyState.classList.add("hidden");

                                // 📌 Restaurar o crear bloque nuevo
                                const lastSeg = segmentsData[segmentsData.length - 1];
                                if (lastSeg && lastSeg.status === "recording") {
                                    const elapsed = Date.now() - (lastSeg.timestamp || Date.now());
                                    const remaining = CHUNK_DURATION_MS - elapsed;
                                    startCountdownForBlock(lastSeg.id, remaining > 0 ? remaining : 5000);
                                } else {
                                    recordSegment();
                                }
                            }
                        } catch (err) {
                        }
                    }
                }
            });

            async function retryPendingAudiosOnReconnect() {
                try {
                    const pending = await loadPendingAudios();
                    if (!pending.length) return;
                    showToast("🔄 Conexión restablecida. Reprocesando audios pendientes...");

                    for (const item of pending) {
                        const { id, audio } = item;
                        let seg = segmentsData.find(s => s.id === id);
                        if (!seg) {
                            segmentsData.push({
                                id,
                                timestamp: Date.now(),
                                raw: null,
                                analyses: {},
                                status: "processing"
                            });
                            seg = segmentsData.find(s => s.id === id);
                        } else {
                            seg.status = "processing";
                        }
                        renderSegment(seg);
                        await processAudioWithGemini(audio, id, "audio/webm");
                    }
                } catch (err) {
                    showToast("No se pudieron reprocesar los audios pendientes.");
                }
            }

            window.addEventListener("online", () => {
                retryPendingAudiosOnReconnect();
            });

            document.addEventListener("DOMContentLoaded", () => {
                const audioSourceModal = document.getElementById("audioSourceModal");
                const btnAudioSource = document.getElementById("btnAudioSource");
                const btnCloseAudioSource = document.getElementById("btnCloseAudioSource");
                
                if (!btnAudioSource || !audioSourceModal) return;
                
                // Variable para preferencia de fuente
                let preferredAudioSource = localStorage.getItem('preferredAudioSource') || 'system';
                
                // Abrir modal
                btnAudioSource.addEventListener("click", () => {
                    audioSourceModal.classList.remove("hidden");
                    audioSourceModal.classList.add("flex");
                });
                
                // Cerrar modal
                btnCloseAudioSource.addEventListener("click", () => {
                    audioSourceModal.classList.add("hidden");
                    audioSourceModal.classList.remove("flex");
                });
                
                audioSourceModal.addEventListener("click", (e) => {
                    if (e.target === audioSourceModal) {
                        audioSourceModal.classList.add("hidden");
                        audioSourceModal.classList.remove("flex");
                    }
                });
                
                // Manejar selección de fuente
                document.querySelectorAll(".audio-source-btn").forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const source = btn.dataset.source;
                        preferredAudioSource = source;
                        localStorage.setItem('preferredAudioSource', source);
                        
                        // Actualizar UI del botón seleccionado
                        document.querySelectorAll(".audio-source-btn").forEach(b => {
                            b.classList.remove("border-blue-400", "bg-blue-100");
                            b.classList.add("border-slate-200", "bg-slate-50");
                        });
                        btn.classList.remove("border-slate-200", "bg-slate-50");
                        btn.classList.add("border-blue-400", "bg-blue-100");
                        
                        showToast(`✅ Fuente configurada: ${getSourceLabel(source)}`);
                        
                        // Si está grabando, preguntar si reiniciar
                        if (isRecording) {
                            if (confirm(`¿Cambiar a ${getSourceLabel(source)}? Esto reiniciará la grabación.`)) {
                                stopContinuousRecording();
                                setTimeout(() => startContinuousRecording(), 1000);
                            }
                        }
                        
                        // Cerrar modal después de un momento
                        setTimeout(() => {
                            audioSourceModal.classList.add("hidden");
                            audioSourceModal.classList.remove("flex");
                        }, 800);
                    });
                });
                
                function getSourceLabel(source) {
                    switch(source) {
                        case 'system': return 'Audio del Sistema';
                        case 'microphone': return 'Micrófono';
                        case 'device': return 'Dispositivo Específico';
                        default: return 'Desconocido';
                    }
                }
                
                // Aplicar fuente guardada al inicio
                setTimeout(() => {
                    document.querySelectorAll(".audio-source-btn").forEach(btn => {
                        if (btn.dataset.source === preferredAudioSource) {
                            btn.classList.remove("border-slate-200", "bg-slate-50");
                            btn.classList.add("border-blue-400", "bg-blue-100");
                        }
                    });
                }, 500);
            });


            async function createNewSession() {
                if (isRecording) stopContinuousRecording();

                // Detener listeners de la sesión anterior para evitar mezcla de bloques
                unsubscribeSessionListeners();

                sessionRevision += 1;
                currentSessionId = null;
                currentSessionOwnerId = null;
                segmentsData = [];
                blockContextNotes = {};
                segmentCounter = 0;
                currentSessionTitle.textContent = "Nueva sesión";
                sessionFeed.innerHTML = '';
                
                // 🔥 OBTENER USUARIO AUTENTICADO
                const user = auth.currentUser || await ensureAuthenticatedFirebaseUser();
                if (!user && isFirebaseActive) {
                    showToast("No hay usuario autenticado. Usando modo local.");
                }
                
                if (isFirebaseActive) {
                    try {
                        const currentUser = auth.currentUser || user;
                        if (!currentUser) {
                            showToast("No hay usuario autenticado. Creando sesión local.");
                            currentSessionId = 'local-' + Date.now();
                            chatHistory[currentSessionId] = [];
                            contextNotesCache.set(currentSessionId, { notes: {}, updatedAt: Date.now() });
                            return;
                        }
                        
                        const docRef = await addDoc(collection(db, "audioTranslate"), {
                            createdAt: serverTimestamp(),
                            title: `Sesión ${new Date().toLocaleTimeString()}`,
                            segments: [],
                            chatIA: [],
                            modelUsed: selectGeminiEndpoint.value,
                            config: { blockMinutes: CHUNK_DURATION_MS / 60000 },
                            // 🔥 AÑADIR USER ID
                            userId: currentUser.uid,
                            // 🔥 AÑADIR EMAIL SI ESTÁ DISPONIBLE (para usuarios registrados)
                            userEmail: currentUser.email || "anonymous"
                        });

                        currentSessionId = docRef.id;
                        currentSessionOwnerId = currentUser.uid;
                        chatHistory[currentSessionId] = [];
                        contextNotesCache.set(currentSessionId, { notes: {}, updatedAt: Date.now() });
                        
                        localStorage.setItem("lastSessionId", currentSessionId);
                        currentSessionTitle.textContent = "Sesión: " + new Date().toLocaleTimeString();
                        showToast("Nueva sesión creada");

                        // ... resto del código
                    } catch (e) {
                        showToast("Error creando sesión en base de datos");
                    }
                } else {
                    currentSessionId = 'local-' + Date.now();
                    chatHistory[currentSessionId] = [];
                    contextNotesCache.set(currentSessionId, { notes: {}, updatedAt: Date.now() });
                    showToast("Sesión local creada");
                }
                
                updateUIState(false);
                emptyState.classList.remove('hidden');
            }

            function checkBrowserCompatibility() {
                const compat = {
                    mediaRecorder: !!window.MediaRecorder,
                    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
                    getDisplayMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
                };
                
                
                if (!compat.mediaRecorder) {
                    showToast("⚠️ Tu navegador no soporta grabación de audio. Usa Chrome o Edge.");
                    return false;
                }
                
                return true;
            }

            // Llamar al cargar
            document.addEventListener('DOMContentLoaded', () => {
                if (!checkBrowserCompatibility()) {
                    btnStart.disabled = true;
                    btnStart.innerHTML = '<i class="fa-solid fa-ban text-lg"></i>';
                    btnStart.title = "Navegador no compatible";
                }
            });

            function checkMediaRecorderCompatibility() {
                try {
                    // Verificar si MediaRecorder está disponible
                    if (typeof MediaRecorder === 'undefined') {
                        return {
                            supported: false,
                            error: "MediaRecorder API no soportada. Usa Chrome 58+, Edge 79+, Firefox 63+ o Safari 14.1+."
                        };
                    }

                    // Verificar tipos MIME compatibles
                    const testStream = new MediaStream(); // Stream vacío para pruebas
                    const mimeTypes = [
                        'audio/webm;codecs=opus',
                        'audio/webm',
                        'audio/mp4',
                        'audio/ogg;codecs=opus'
                    ];

                    const supportedTypes = mimeTypes.filter(type => {
                        try {
                            return MediaRecorder.isTypeSupported(type);
                        } catch (e) {
                            return false;
                        }
                    });


                    return {
                        supported: true,
                        mimeTypes: supportedTypes
                    };
                } catch (err) {
                    return {
                        supported: false,
                        error: err.message
                    };
                }
            }

            // Llamar esta función al inicio
            document.addEventListener('DOMContentLoaded', () => {
                const compat = checkMediaRecorderCompatibility();
                if (!compat.supported) {
                    showToast(`⚠️ ${compat.error}`);
                    btnStart.disabled = true;
                    btnStart.innerHTML = '<i class="fa-solid fa-ban text-lg"></i>';
                    btnStart.title = "Navegador no compatible";
                }
            });



            // Agregar esta función ANTES de startContinuousRecording
            async function getAudioSource() {
                const preferredSource = preferredAudioSource || localStorage.getItem('preferredAudioSource') || 'system';
                
                try {
                    // Intentar con la fuente preferida
                    if (preferredSource === 'system') {
                        const systemAudio = await trySystemAudio();
                        if (systemAudio) return systemAudio;
                    }
                    
                    // Fallback a micrófono
                    const mic = await getMicrophone();
                    if (mic) return mic;
                    
                    throw new Error("No se pudo obtener ninguna fuente de audio");
                    
                } catch (err) {
                    showToast("⚠️ Error de audio: " + err.message);
                    throw err;
                }
            }



            async function trySystemAudio() {
                try {
                    
                    // Primero verificar si getDisplayMedia está disponible
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                        return null;
                    }
                    
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            displaySurface: "browser",
                            cursor: "never"
                        },
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            sampleRate: 44100,
                            channelCount: 2
                        },
                        // Opciones específicas para asegurar audio
                        audio: true,
                        preferCurrentTab: true
                    });
                    
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        
                        // Detener video (solo queremos audio)
                        const videoTracks = stream.getVideoTracks();
                        videoTracks.forEach(track => {
                            track.enabled = false;
                            setTimeout(() => track.stop(), 100);
                        });
                        
                        // Verificar que los tracks de audio estén activos
                        const activeAudio = audioTracks.filter(t => t.enabled && t.readyState === 'live');
                        if (activeAudio.length === 0) {
                            stream.getTracks().forEach(track => track.stop());
                            return null;
                        }
                        
                        return {
                            stream: stream,
                            source: 'system',
                            label: 'Audio del Sistema (Chrome/Edge)'
                        };
                    } else {
                        
                        // Mostrar mensaje específico
                        showToast("⚠️ No seleccionaste 'Compartir audio'. Usando micrófono.");
                        
                        // Detener todos los tracks
                        stream.getTracks().forEach(track => track.stop());
                        return null;
                    }
                    
                } catch (err) {
                    
                    // Si el usuario cancela, mostrar mensaje más amigable
                    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                        showToast("Selección de pantalla cancelada. Usando micrófono.");
                    }
                    
                    return null;
                }
            }



            async function tryLoopbackDevices() {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const audioInputs = devices.filter(d => d.kind === 'audioinput');
                    
                    
                    // Buscar dispositivos de loopback comunes
                    const loopbackKeywords = [
                        'stereo mix', 'loopback', 'virtual cable', 'what u hear',
                        'vb-audio', 'cable', 'voicemeeter', 'blackhole'
                    ];
                    
                    const loopbackDevice = audioInputs.find(device => {
                        const label = device.label.toLowerCase();
                        return loopbackKeywords.some(keyword => label.includes(keyword));
                    });
                    
                    if (loopbackDevice) {
                        
                        const stream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                deviceId: { exact: loopbackDevice.deviceId },
                                echoCancellation: false,
                                noiseSuppression: false
                            }
                        });
                        
                        return {
                            stream: stream,
                            source: 'loopback',
                            label: loopbackDevice.label
                        };
                    }
                    
                    return null;
                    
                } catch (err) {
                    return null;
                }
            }

            async function getMicrophone() {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            sampleRate: 44100
                        }
                    });
                    
                    return {
                        stream: stream,
                        source: 'microphone',
                        label: 'Micrófono'
                    };
                } catch (err) {
                    throw new Error("No se pudo acceder al micrófono: " + err.message);
                }
            }

            let gainProcessingContext = null;
            let gainProcessingSource = null;
            let gainProcessingNode = null;
            let gainProcessingDestination = null;

            function destroyGainProcessing() {
                if (gainProcessingSource) {
                    try { gainProcessingSource.disconnect(); } catch (_) {}
                }
                if (gainProcessingNode) {
                    try { gainProcessingNode.disconnect(); } catch (_) {}
                }
                gainProcessingSource = null;
                gainProcessingNode = null;
                gainProcessingDestination = null;

                if (gainProcessingContext) {
                    const ctx = gainProcessingContext;
                    gainProcessingContext = null;
                    ctx.close().catch(() => {});
                }
            }

            async function buildStreamWithGain(inputStream) {
                destroyGainProcessing();
                if (!inputStream) return inputStream;

                const normalizedGain = clampMicGain(micGainValue);
                if (Math.abs(normalizedGain - 1) < 0.001) {
                    return inputStream;
                }

                const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextCtor) return inputStream;

                gainProcessingContext = new AudioContextCtor();
                if (gainProcessingContext.state === "suspended") {
                    await gainProcessingContext.resume();
                }

                gainProcessingSource = gainProcessingContext.createMediaStreamSource(inputStream);
                gainProcessingNode = gainProcessingContext.createGain();
                gainProcessingNode.gain.value = normalizedGain;
                gainProcessingDestination = gainProcessingContext.createMediaStreamDestination();

                gainProcessingSource.connect(gainProcessingNode);
                gainProcessingNode.connect(gainProcessingDestination);

                return gainProcessingDestination.stream;
            }

            function applyLiveMicGain(nextValue) {
                const normalizedGain = clampMicGain(nextValue);
                micGainValue = normalizedGain;
                updateMicGainLabel(normalizedGain);

                if (gainProcessingNode && gainProcessingContext) {
                    const now = gainProcessingContext.currentTime;
                    gainProcessingNode.gain.cancelScheduledValues(now);
                    gainProcessingNode.gain.setTargetAtTime(normalizedGain, now, 0.05);
                }
            }

            function cleanupActiveStreams() {
                if (globalStream && globalStream !== rawInputStream) {
                    globalStream.getTracks().forEach(track => track.stop());
                }

                if (rawInputStream) {
                    rawInputStream.getTracks().forEach(track => track.stop());
                } else if (globalStream) {
                    globalStream.getTracks().forEach(track => track.stop());
                }

                globalStream = null;
                rawInputStream = null;
                destroyGainProcessing();
            }

            function configureForLongRecordings() {
                // 🔥 RESPETAR LA CONFIGURACIÓN DEL USUARIO - NO FORZAR 15 MINUTOS
                
                // Validar que la duración sea razonable (pero respetar lo que el usuario eligió)
                if (CHUNK_DURATION_MS < 60000) {
                    CHUNK_DURATION_MS = 60000;
                }
                
                if (CHUNK_DURATION_MS > 7200000) { // 120 minutos máximo
                    CHUNK_DURATION_MS = 7200000;
                }
                
                // Configurar MediaRecorder para mejor rendimiento
                const optimalConfig = {
                    audioBitsPerSecond: 64000, // Bitrate más bajo para archivos más pequeños
                    mimeType: 'audio/webm;codecs=opus' // Codec eficiente
                };
                
                return optimalConfig;
            }

    // Variables globales para análisis de audio
    let audioAnalyser = null;
    let audioDataArray = null;
    let audioTimeDataArray = null;
    let audioContextInstance = null;
    let audioSourceNode = null;

    // Función para iniciar análisis de audio real
    async function startAudioAnalysis(stream) {
        stopAudioAnalysis();
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor || !stream) return;

        audioContextInstance = new AudioContextCtor();
        if (audioContextInstance.state === 'suspended') {
            await audioContextInstance.resume();
        }

        audioSourceNode = audioContextInstance.createMediaStreamSource(stream);
        audioAnalyser = audioContextInstance.createAnalyser();
        audioAnalyser.fftSize = 512;
        audioAnalyser.smoothingTimeConstant = 0.6;
        audioSourceNode.connect(audioAnalyser);

        audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioTimeDataArray = new Uint8Array(audioAnalyser.fftSize);
    }

    function stopAudioAnalysis() {
        if (audioSourceNode) {
            try { audioSourceNode.disconnect(); } catch (_) {}
        }
        if (audioAnalyser) {
            try { audioAnalyser.disconnect(); } catch (_) {}
        }
        audioSourceNode = null;
        audioAnalyser = null;
        audioDataArray = null;
        audioTimeDataArray = null;

        if (audioContextInstance) {
            const ctx = audioContextInstance;
            audioContextInstance = null;
            ctx.close().catch(() => {});
        }
    }

    // Función para obtener nivel de audio actual
    function getAudioLevel() {
        if (!audioAnalyser || !audioDataArray || !audioTimeDataArray) return 0;

        audioAnalyser.getByteFrequencyData(audioDataArray);
        audioAnalyser.getByteTimeDomainData(audioTimeDataArray);

        let freqSum = 0;
        for (let i = 0; i < audioDataArray.length; i++) {
            freqSum += audioDataArray[i];
        }
        const freqLevel = (freqSum / audioDataArray.length) / 255;

        let timeSquares = 0;
        for (let i = 0; i < audioTimeDataArray.length; i++) {
            const centered = (audioTimeDataArray[i] - 128) / 128;
            timeSquares += centered * centered;
        }
        const rms = Math.sqrt(timeSquares / audioTimeDataArray.length);

        return Math.min(1, freqLevel * 0.65 + rms * 1.35);
    }


    async function startContinuousRecording() {
        // 🔥 VERIFICAR CONFIGURACIÓN ACTUAL ANTES DE INICIAR
        
        // Mostrar confirmación de configuración
        showToast(`🎙️ Iniciando grabación con bloques de ${CHUNK_DURATION_MS/60000} minutos`);
        
        if (!currentSessionId) {
            await createNewSession();
        }

        try {
            showToast("🔍 Buscando fuente de audio...");
            
            // 🔥 PRIMERO: OBTENER EL STREAM DE AUDIO
            const audioSource = await getAudioSource();
            
            // Verificar que realmente tenemos un stream
            if (!audioSource || !audioSource.stream) {
                throw new Error("No se pudo obtener el stream de audio");
            }
            
            rawInputStream = audioSource.stream;
            globalStream = await buildStreamWithGain(rawInputStream);
            isRecording = true;
            
            // Iniciar análisis de audio
            await startAudioAnalysis(globalStream);
            
            
            showToast(`🎙️ Grabando desde: ${audioSource.label}`);
            
            updateUIState(true);
            if (emptyState) emptyState.classList.add('hidden');
            
            // 🔥 LUEGO: Configurar para grabaciones largas (RESPETANDO configuración)
            const config = configureForLongRecordings();
            
            // 🔥 FINALMENTE: Iniciar la grabación
            recordSegment();
            
        } catch (err) {
            isRecording = false;
            stopAudioAnalysis();
            cleanupActiveStreams();
            
            // Mensajes de error más específicos
            let errorMsg = "No se pudo acceder al audio. ";
            
            if (err.name === 'NotAllowedError') {
                errorMsg += "Permiso denegado. Verifica los permisos del micrófono.";
            } else if (err.name === 'NotFoundError') {
                errorMsg += "No se encontró dispositivo de audio.";
            } else if (err.name === 'NotSupportedError') {
                errorMsg += "Tu navegador no soporta esta función. Prueba con Chrome o Edge.";
            } else {
                errorMsg += err.message;
            }
            
            showToast(`❌ ${errorMsg}`);
            
            // Mostrar modal de ayuda si hay error persistente
            if (err.name === 'NotSupportedError') {
                setTimeout(() => {
                    if (confirm("¿Necesitas ayuda para configurar el audio? Te guiaremos paso a paso.")) {
                        showAudioHelpModal();
                    }
                }, 1000);
            }
        }
    }


            // Agregar monitoreo de memoria
            let memoryWarningShown = false;

            function monitorRecordingHealth() {
                const checkInterval = setInterval(() => {
                    // Verificar uso de memoria
                    if (performance && performance.memory) {
                        const usedMB = performance.memory.usedJSHeapSize / (1024 * 1024);
                        const limitMB = performance.memory.jsHeapSizeLimit / (1024 * 1024);
                        
                        if (usedMB > limitMB * 0.8 && !memoryWarningShown) {
                            showToast("⚠️ Uso de memoria alto. Considera detener y reiniciar la grabación.");
                            memoryWarningShown = true;
                        }
                    }
                    
                    // Verificar si MediaRecorder sigue activo
                    if (window.currentMediaRecorder && 
                        window.currentMediaRecorder.state === 'recording') {
                        const elapsed = Date.now() - recordingStartTime;
                    }
                }, 30000); // Verificar cada 30 segundos
                
                return checkInterval;
            }

            async function restartRecordingSafely() {
                if (!isRecording) return;
                
                
                // 1. Detener grabación actual
                stopContinuousRecording();
                
                // 2. Esperar un momento
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 3. Limpiar caché si es necesario
                if (window.performance && window.performance.memory) {
                    if (window.performance.memory.usedJSHeapSize > 500 * 1024 * 1024) {
                        if (window.gc) window.gc(); // Forzar garbage collection si disponible
                    }
                }
                
                // 4. Reiniciar
                startContinuousRecording();
            }

            // Llamar automáticamente después de cierto tiempo
            let autoRestartTimer = null;

            function setupAutoRestart() {
                if (autoRestartTimer) clearTimeout(autoRestartTimer);
                
                autoRestartTimer = setTimeout(() => {
                    if (isRecording) {
                        showToast("🔄 Reinicio automático para optimizar rendimiento...");
                        restartRecordingSafely();
                    }
                }, 45 * 60000); // Reiniciar cada 45 minutos
            }


            function showAudioHelpModal() {
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
                modal.innerHTML = `
                    <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">🛠️ Configurar Audio del Sistema</h3>
                        
                        <div class="space-y-3 text-sm text-slate-600">
                            <p><strong>Chrome/Edge:</strong></p>
                            <ol class="list-decimal pl-5 space-y-1">
                                <li>Abre un video o audio en otra pestaña</li>
                                <li>Haz clic en "Audio del Sistema"</li>
                                <li>Selecciona la pestaña que reproduce sonido</li>
                                <li>Marca "Compartir audio"</li>
                            </ol>
                            
                            <p class="mt-4"><strong>Firefox:</strong></p>
                            <p>Firefox no soporta captura de audio del sistema. Usa "Micrófono" o instala una extensión.</p>
                            
                            <p class="mt-4"><strong>Solución rápida:</strong></p>
                            <p>Usa "Micrófono" para grabar tu voz directamente.</p>
                        </div>
                        
                        <div class="mt-6 flex justify-end gap-2">
                            <button id="closeHelp" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg">Cerrar</button>
                            <button id="tryMicrophone" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Probar Micrófono</button>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                modal.querySelector('#closeHelp').addEventListener('click', () => {
                    modal.remove();
                });
                
                modal.querySelector('#tryMicrophone').addEventListener('click', () => {
                    modal.remove();
                    // Cambiar preferencia a micrófono
                    localStorage.setItem('preferredAudioSource', 'microphone');
                    setTimeout(() => {
                        if (!isRecording) {
                            startContinuousRecording();
                        }
                    }, 500);
                });
            }



            // Función para verificar nivel de audio (debug)
            function checkAudioLevel(stream) {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                let checkCount = 0;
                const checkInterval = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / bufferLength;
                    
                    checkCount++;
                    if (checkCount === 3) { // Después de 3 verificaciones
                        
                        if (average < 5) {
                            showToast("⚠️ El volumen de entrada es muy bajo");
                        }
                        
                        clearInterval(checkInterval);
                    }
                }, 500);
            }

    function getAudioBarLevels(numBars) {
        if (!audioAnalyser || !audioDataArray || !audioTimeDataArray) return null;

        audioAnalyser.getByteFrequencyData(audioDataArray);
        audioAnalyser.getByteTimeDomainData(audioTimeDataArray);

        let timeSquares = 0;
        for (let i = 0; i < audioTimeDataArray.length; i++) {
            const centered = (audioTimeDataArray[i] - 128) / 128;
            timeSquares += centered * centered;
        }
        const rms = Math.sqrt(timeSquares / audioTimeDataArray.length);

        const levels = new Array(numBars).fill(0);
        const bucketSize = Math.max(1, Math.floor(audioDataArray.length / numBars));
        for (let i = 0; i < numBars; i++) {
            let sum = 0;
            const start = i * bucketSize;
            const end = Math.min(audioDataArray.length, start + bucketSize);
            for (let j = start; j < end; j++) {
                sum += audioDataArray[j];
            }
            const avg = sum / (end - start || 1);
            const freqLevel = avg / 255;
            levels[i] = Math.min(1, Math.max(0.02, (freqLevel * 1.15) + (rms * 0.35)));
        }

        return levels;
    }

    // Función para animar las barras de audio con datos reales
    function animateAudioWave(blockId, isActive) {
        const blockEl = document.getElementById(`seg-${blockId}`);
        if (!blockEl) return;
        
        const audioBars = blockEl.querySelectorAll('.audio-bar');
        if (!audioBars.length) return;

        const audioWaveEl = blockEl.querySelector('.audio-wave');
        
        // Limpiar intervalo anterior si existe
        const seg = segmentsData.find(s => s.id === blockId);
        if (seg && seg.audioWaveInterval) {
            clearInterval(seg.audioWaveInterval);
        }
        
        if (!isActive) {
            if (audioWaveEl) audioWaveEl.classList.add('audio-wave-subtle');
            audioBars.forEach((bar) => {
                bar.style.transform = 'scaleY(0.08)';
                bar.style.backgroundColor = '#fca5a5';
            });
            if (seg) seg.audioWaveInterval = null;
            return;
        }

        if (audioWaveEl) audioWaveEl.classList.remove('audio-wave-subtle');
        
        // Animación con datos reales de audio
        const interval = setInterval(() => {
            const liveBlockEl = document.getElementById(`seg-${blockId}`);
            if (!liveBlockEl) {
                clearInterval(interval);
                if (seg) seg.audioWaveInterval = null;
                return;
            }

            const liveBars = liveBlockEl.querySelectorAll('.audio-bar');
            if (!liveBars.length) {
                clearInterval(interval);
                if (seg) seg.audioWaveInterval = null;
                return;
            }

            const levels = getAudioBarLevels(liveBars.length);
            if (!levels) return;

            let peak = 0;
            liveBars.forEach((bar, index) => {
                const barLevel = levels[index] ?? 0;
                peak = Math.max(peak, barLevel);
                const scaledHeight = Math.max(barLevel, 0.08);
                
                bar.style.transform = `scaleY(${scaledHeight})`;
                
                // Cambiar color según intensidad
                if (scaledHeight > 0.6) {
                    bar.style.backgroundColor = '#dc2626';
                } else if (scaledHeight > 0.3) {
                    bar.style.backgroundColor = '#ef4444';
                } else {
                    bar.style.backgroundColor = '#f87171';
                }
            });

            const levelLabel = liveBlockEl.querySelector(`[data-audio-level="${blockId}"]`);
            if (levelLabel) {
                levelLabel.textContent = `Nivel real: ${Math.round(peak * 100)}%`;
            }
        }, 70);
        
        if (seg) seg.audioWaveInterval = interval;
    }


    function recordSegment() {
        if (!isRecording || !globalStream) return;


        // 🔥 VERIFICAR CONFIGURACIÓN ACTUAL


        // Verificar que el stream tenga tracks de audio activos
        const audioTracks = globalStream.getAudioTracks();
        if (audioTracks.length === 0 || audioTracks.every(t => t.readyState === 'ended')) {
            showToast("Error: La fuente de audio no está disponible. Reinicia la grabación.");
            stopContinuousRecording();
            return;
        }

        // Generar ID único para el bloque
        const existing = segmentsData.map(s => s.id).filter(x => typeof x === "number");
        const newId = Math.max(0, ...existing) + 1;
        segmentCounter = newId;

        const newSegment = {
            id: newId,
            timestamp: Date.now(),
            raw: null,
            analyses: {},
            status: 'recording'
        };
        segmentsData.push(newSegment);
        renderSegment(newSegment);
        updateStatus(`Grabando bloque #${newId}...`);
        startCountdownForBlock(newId, CHUNK_DURATION_MS);
        
        // Iniciar animación de onda de audio
        setTimeout(() => {
            animateAudioWave(newId, true);
        }, 100);

        // Determinar tipo MIME compatible
        let mimeType = '';
        const preferredTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus'
        ];
        
        for (const type of preferredTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }
        

        try {
            // Configuración para grabaciones largas
            const config = {
                audioBitsPerSecond: 64000, // Bitrate bajo para archivos más pequeños
                ...(mimeType ? { mimeType } : {}) // Solo incluir mimeType si existe
            };
            
            const mediaRecorder = new MediaRecorder(globalStream, config);
            
            // Limpiar recorder anterior si existe
            if (window.currentMediaRecorder && window.currentMediaRecorder.state !== 'inactive') {
                window.currentMediaRecorder.stop();
            }
            window.currentMediaRecorder = mediaRecorder;

            const audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            // Configurar timeout ANTES de iniciar grabación
            const timeoutDuration = CHUNK_DURATION_MS;
            let blockTimeout = null;
            
            mediaRecorder.onstop = async () => {
                
                // Limpiar timeout si existe
                if (blockTimeout) {
                    clearTimeout(blockTimeout);
                    blockTimeout = null;
                }
                
                // Detener timer de cuenta regresiva
                const segIndex = segmentsData.findIndex(s => s.id === newId);
                if (segIndex !== -1 && segmentsData[segIndex].timerInterval) {
                    clearInterval(segmentsData[segIndex].timerInterval);
                    segmentsData[segIndex].timerInterval = null;
                }

                if (audioChunks.length === 0) {
                    segmentsData[segIndex].status = "error";
                    segmentsData[segIndex].error = "No se capturó audio";
                    renderSegment(segmentsData[segIndex]);
                    return;
                }

                const audioBlob = new Blob(audioChunks, { 
                    type: mimeType || 'audio/webm' 
                });
                
                
                // Guardar como pendiente y procesar (no bloquear la siguiente grabación)
                await savePendingAudio(newId, audioBlob);
                processAudioWithGemini(audioBlob, newId, mimeType || 'audio/webm');
                
                // 🔥 SOLO INICIAR NUEVO SEGMENTO SI autoNextBlock ESTÁ ACTIVADO
                if (isRecording && autoNextBlock) {
                    setTimeout(() => recordSegment(), 500);
                } else if (isRecording && !autoNextBlock) {
                    // Si autoNextBlock está desactivado, mostrar mensaje
                    showToast("⏸️ Grabación en pausa. Usa 'Siguiente bloque' para continuar.");
                    updateStatus("Grabación en pausa - Esperando siguiente bloque");
                }
            };

            mediaRecorder.onerror = (e) => {
                
                // Limpiar timeout si existe
                if (blockTimeout) {
                    clearTimeout(blockTimeout);
                    blockTimeout = null;
                }
                
                segmentsData.find(s => s.id === newId).status = "error";
                segmentsData.find(s => s.id === newId).error = "Error de grabación";
                renderSegment(segmentsData.find(s => s.id === newId));
                showToast(`❌ Error grabando bloque ${newId}`);
                
                // Intentar reiniciar solo si autoNextBlock está activado
                if (isRecording && autoNextBlock) {
                    setTimeout(() => recordSegment(), 1000);
                }
            };

            // Iniciar grabación con intervalo de datos
            mediaRecorder.start(5000); // Emitir cada 5 segundos para audios largos

            // 🔥 SOLO CONFIGURAR TIMEOUT SI autoNextBlock ESTÁ ACTIVADO
            if (autoNextBlock) {
                blockTimeout = setTimeout(() => {
                    if (isRecording && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, timeoutDuration);
                
                // Guardar referencia para limpiar si es necesario
                newSegment.timeoutId = blockTimeout;
            } else {
                // Mostrar indicador de que está en modo manual
                updateStatus(`Grabando bloque #${newId} (modo manual)`);
            }

        } catch (err) {
            
            let errorMsg = "No se pudo iniciar la grabación. ";
            if (err.name === 'NotSupportedError') {
                errorMsg += "El navegador no soporta el formato de audio. ";
                // Intentar con configuración mínima
                try {
                    const fallbackRecorder = new MediaRecorder(globalStream);
                    fallbackRecorder.start();
                    window.currentMediaRecorder = fallbackRecorder;
                    showToast("✅ Grabación iniciada con configuración alternativa");
                    return;
                } catch (fallbackErr) {
                    errorMsg += "Configuración alternativa también falló.";
                }
            }
            
            showToast(`❌ ${errorMsg}`);
            stopContinuousRecording();
        }
    }

            function stopContinuousRecording() {
                if (!isRecording) return;
                
                isRecording = false;
                
                // Detener el timeout de grabación
                if (recordingTimeout) {
                    clearTimeout(recordingTimeout);
                    recordingTimeout = null;
                }
                
                // Detener el MediaRecorder actual si está grabando
                if (window.currentMediaRecorder && window.currentMediaRecorder.state === 'recording') {
                    try {
                        window.currentMediaRecorder.stop();
                    } catch (e) {
                    }
                }
                
                // Detener todos los tracks activos y liberar pipeline de ganancia
                cleanupActiveStreams();

                stopAudioAnalysis();
                
                // Actualizar UI
                updateUIState(false);
                updateStatus("Grabación finalizada.");
                showToast("✅ Grabación detenida");
                
                // Detener overlay si existe
                toggleRecordingOverlay(false);
                
                // Cambiar estado de bloques en grabación a "detenido"
                segmentsData.forEach(seg => {
                    if (seg.audioWaveInterval) {
                        clearInterval(seg.audioWaveInterval);
                        seg.audioWaveInterval = null;
                    }
                    
                    // Cambiar a animación sutil si el bloque sigue visible
                    if (seg.status === 'recording') {
                        seg.status = 'stopped';
                        animateAudioWave(seg.id, false);
                    }
                });

            }

            function updateNextBlockButton() {
                const btnNextBlock = document.getElementById('btnNextBlock');
                
                if (isRecording && !autoNextBlock) {
                    // Mostrar y habilitar el botón en modo manual
                    btnNextBlock.classList.remove('hidden');
                    btnNextBlock.classList.add('flex');
                    btnNextBlock.disabled = false;
                } else {
                    // Ocultar el botón en modo automático
                    btnNextBlock.classList.add('hidden');
                    btnNextBlock.classList.remove('flex');
                    btnNextBlock.disabled = true;
                }
            }


            // 🔁 Detiene el bloque actual y comienza uno nuevo
            function stopAndStartNewBlock() {
                if (!isRecording) return;

                // Cerrar el bloque activo simulando el fin del timer

                // Detenemos el mediaRecorder actual si existe
                if (window.currentMediaRecorder && window.currentMediaRecorder.state !== "inactive") {
                    window.currentMediaRecorder.stop();
                }

                // Comienza inmediatamente el siguiente bloque
                setTimeout(() => {
                    if (isRecording) {
                        recordSegment();
                        showToast("Nuevo bloque iniciado manualmente");
                    }
                }, 500);
            }


            function updateAudioSourceButton(source) {
                const btn = document.getElementById('btnAudioSource');
                if (!btn) return;
                
                const icons = {
                    'system': 'fa-computer',
                    'microphone': 'fa-microphone',
                    'device': 'fa-sliders'
                };
                
                const colors = {
                    'system': 'blue',
                    'microphone': 'green',
                    'device': 'purple'
                };
                
                const sourceName = {
                    'system': 'Sistema',
                    'microphone': 'Micrófono',
                    'device': 'Dispositivo'
                };
                
                const color = colors[source] || 'blue';
                const icon = icons[source] || 'fa-wave-square';
                
                btn.innerHTML = `
                    <i class="fa-solid ${icon} text-sm text-${color}-600"></i>
                    <span class="hidden md:inline">${sourceName[source]}</span>
                `;
            }


            // --- GEMINI INTEGRATION ---

            // REEMPLAZA tu función processAudioWithGemini con esta versión optimizada
            async function processAudioWithGemini(blob, blockId, mimeType) {
                const myRevision = sessionRevision;
                const blockKey = String(blockId);
                const normalizedBlockId = /^\d+$/.test(blockKey) ? Number(blockKey) : blockId;

                const getSegmentIndexById = () => segmentsData.findIndex(s => String(s.id) === blockKey);
                const getSegmentById = () => {
                    const idx = getSegmentIndexById();
                    return idx === -1 ? null : segmentsData[idx];
                };
                const ensureSegmentById = () => {
                    const existing = getSegmentById();
                    if (existing) return existing;
                    const seg = {
                        id: normalizedBlockId,
                        timestamp: Date.now(),
                        raw: "",
                        analyses: {},
                        status: "processing"
                    };
                    segmentsData.push(seg);
                    return seg;
                };

                if (blob.size > 10 * 1024 * 1024) { // Mayor a 10MB
                    showToast("⚠️ Audio muy grande, procesando puede tardar...");
                }

                const processingSeg = ensureSegmentById();
                processingSeg.status = "processing";
                renderSegment(processingSeg);

                try {
                    const base64Audio = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onerror = () => reject(reader.error || new Error("No se pudo leer el audio"));
                        reader.onloadend = () => {
                            const result = typeof reader.result === "string" ? reader.result : "";
                            const base64 = result.includes(",") ? result.split(",")[1] : "";
                            if (!base64) {
                                reject(new Error("No se pudo convertir el audio a base64"));
                                return;
                            }
                            resolve(base64);
                        };
                        reader.readAsDataURL(blob);
                    });

                    if (myRevision !== sessionRevision) return;
                    
                    // ✅ PROMPT MEJORADO CON DETECCIÓN AUTOMÁTICA DE IDIOMA Y TRANSCRIPCIÓN LITERAL
                    const prompt = `Analiza el audio y responde EXCLUSIVAMENTE con JSON válido.

                    1. IDENTIFICAR IDIOMA: Detecta automáticamente el idioma principal hablado (español, inglés, francés, etc.)
                    2. TRANSCRIBIR: Transcribe el audio de forma LITERAL (verbatim) en el idioma original que escuchas
                    3. DETECTAR HABLANTES: Si hay más de una persona hablando, identifica cambios de hablante
                    - Usa diferencias de timbre, tono, prosodia, ritmo y patrón conversacional para separar voces.
                    - Mantén IDs estables por bloque: "Persona 1", "Persona 2", etc.
                    4. RESUMIR: Genera un título breve (máximo 4 palabras) que capture la esencia
                    5. EXACTITUD MULTILINGÜE:
                    - Si aparece una palabra o frase en otro idioma, CONSÉRVALA tal cual se escucha.
                    - NO traduzcas palabras ni frases.
                    - NO "corrijas" ni normalices nombres propios, marcas o términos técnicos.
                    - NO inventes palabras. Si no entiendes una palabra, usa [inaudible].
                    - Si dudas de una palabra, prioriza [inaudible] antes que adivinar.
                    - NO incluyas comentarios, explicaciones, ni texto fuera del JSON.
                    - NO incluyas marcas de tiempo (ej. 00:12, 01:03, etc.).
                    - El campo "transcripcion" debe contener SOLO la transcripción.

                    IMPORTANTE PARA DIÁLOGOS:
                    - Si escuchas que hablan diferentes personas, indica claramente los cambios.
                    - OBLIGATORIO: si detectas 2 o más voces, la transcripción debe llevar etiquetas por línea:
                      "Persona 1: ...", "Persona 2: ...", etc.
                    - Mantén el diálogo estructurado y claro.

                    RESPONDE EXCLUSIVAMENTE en este formato JSON:

                    {
                    "idioma": "nombre del idioma detectado en español",
                    "transcripcion": "texto transcrito aquí con identificación de hablantes si corresponde",
                    "subtitulo": "título breve aquí",
                    "turnos_hablantes": [
                      { "persona": "Persona 1", "texto": "..." },
                      { "persona": "Persona 2", "texto": "..." }
                    ]
                    }

                    Si hay diálogo, la transcripción debe tener formato:
                    Persona 1: [lo que dice la primera persona]
                    Persona 2: [respuesta de la segunda persona]
                    Persona 1: [continúa la conversación]`;

                    // ✅ USO DE FLASH-LITE COMO PRIMERA OPCIÓN
                    const API_MODELS = [
                        "gemini-2.5-flash-lite",  // Primera opción - más barato
                        "gemini-2.5-flash",       // Fallback 1
                        "gemini-2.5-pro",         // Fallback 2 (más potente)
                        "gemini-3.5-flash",       // Fallback 3
                        "gemini-3-flash-preview", // Fallback 4 (preview)
                        "gemini-2.0-flash",       // Fallback 5
                        "gemini-2.0-flash-lite"   // Fallback 6
                    ];

                    let result = null;
                    let rawResponse = null;
                    
                    for (const model of API_MODELS) {
                        try {
                            const body = {
                                contents: [{
                                    parts: [
                                        { text: prompt },
                                        { inline_data: { mime_type: mimeType, data: base64Audio } }
                                    ]
                                }],
                                generationConfig: {
                                    temperature: 0,
                                    topP: 0.1,
                                    topK: 1
                                }
                            };
                            
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 60000);
                            const { response: res, data: json } = await geminiBackendFetch("/api/gemini/generate", {
                                method: "POST",
                                body: JSON.stringify({ model, payload: body }),
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            if (!res.ok || json.error) throw new Error(String(json?.error || `HTTP ${res.status}`));
                            
                            rawResponse = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                            
                            if (rawResponse) {
                                // Intentar extraer JSON de diferentes formas
                                let jsonMatch = rawResponse.match(/\{[\s\S]*\}/); // Método 1
                                
                                if (!jsonMatch) {
                                    // Método 2: Buscar entre triple backticks
                                    jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                    if (jsonMatch) jsonMatch = [jsonMatch[0], jsonMatch[1]];
                                }
                                
                                if (!jsonMatch) {
                                    // Método 3: Buscar texto que parezca JSON
                                    const possibleJson = rawResponse.split('\n').find(line => line.trim().startsWith('{'));
                                    if (possibleJson) {
                                        jsonMatch = [possibleJson, possibleJson];
                                    }
                                }
                                
                                if (jsonMatch) {
                                    try {
                                        const jsonText = jsonMatch[1] || jsonMatch[0];
                                        result = JSON.parse(jsonText);
                                        
                                        // Normalizar posibles nombres de campo para turnos
                                        if (!Array.isArray(result.turnos_hablantes)) {
                                            if (Array.isArray(result.turnosHablantes)) result.turnos_hablantes = result.turnosHablantes;
                                            else if (Array.isArray(result.speaker_turns)) result.turnos_hablantes = result.speaker_turns;
                                            else if (Array.isArray(result.turns)) result.turnos_hablantes = result.turns;
                                        }

                                        // Validar que tenga los campos necesarios
                                        if (!result.idioma || !result.transcripcion) {
                                            if (!result.idioma && rawResponse.toLowerCase().includes("español")) {
                                                result.idioma = "español";
                                            } else if (!result.idioma && rawResponse.toLowerCase().includes("english")) {
                                                result.idioma = "inglés";
                                            } else if (!result.idioma && rawResponse.toLowerCase().includes("français")) {
                                                result.idioma = "francés";
                                            } else {
                                                result.idioma = "desconocido";
                                            }
                                            
                                            if (!result.transcripcion) {
                                                const lines = rawResponse.split('\n');
                                                const transcriptionLines = lines.filter(line => 
                                                    !line.includes('{') && 
                                                    !line.includes('}') && 
                                                    !line.includes('"idioma"') && 
                                                    !line.includes('"transcripcion"') &&
                                                    line.trim().length > 10
                                                );
                                                result.transcripcion = transcriptionLines.join(' ') || rawResponse;
                                            }
                                        }
                                        
                                        break; // Salir del loop si éxito
                                    } catch (e) {
                                        // Continuar al siguiente modelo
                                    }
                                }
                            }
                        } catch (err) {
                            // Continuar al siguiente modelo
                        }
                    }
                    
                    // Si no se obtuvo resultado, usar fallback
                    if (!result) {
                        try {
                            const fallbackPrompt = `Transcribe este audio de forma literal (verbatim) y detecta idioma.
                            Reglas estrictas:
                            - No traduzcas.
                            - Mantén palabras en otros idiomas exactamente como se oyen.
                            - No inventes palabras.
                            - Si una palabra no se entiende, escribe [inaudible].
                            - No pongas marcas de tiempo.
                            - Devuelve SOLO la transcripción, sin comentarios.`;
                            const fallbackBody = {
                                contents: [{
                                    parts: [
                                        { text: fallbackPrompt },
                                        { inline_data: { mime_type: mimeType, data: base64Audio } }
                                    ]
                                }],
                                generationConfig: {
                                    temperature: 0,
                                    topP: 0.1,
                                    topK: 1
                                }
                            };
                            
                            const { response: fallbackRes, data: fallbackJson } = await geminiBackendFetch("/api/gemini/generate", {
                                method: "POST",
                                body: JSON.stringify({ model: "gemini-2.5-flash-lite", payload: fallbackBody })
                            });
                            if (!fallbackRes.ok || fallbackJson.error) {
                                throw new Error(String(fallbackJson?.error || `HTTP ${fallbackRes.status}`));
                            }
                            const fallbackText = fallbackJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
                            
                            // Intentar detectar idioma del texto
                            let detectedLang = "desconocido";
                            const textLower = fallbackText.toLowerCase();
                            
                            if (textLower.includes("español") || /hola|gracias|por favor|buenos días/i.test(textLower)) {
                                detectedLang = "español";
                            } else if (textLower.includes("inglés") || textLower.includes("english") || /hello|thank you|please|good morning/i.test(textLower)) {
                                detectedLang = "inglés";
                            } else if (textLower.includes("francés") || textLower.includes("français") || /bonjour|merci|s'il vous plaît/i.test(textLower)) {
                                detectedLang = "francés";
                            }
                            
                            result = {
                                idioma: detectedLang,
                                transcripcion: sanitizeRawTranscriptionText(fallbackText),
                                subtitulo: `Bloque ${blockId}`,
                                turnos_hablantes: []
                            };
                        } catch (fallbackErr) {
                            result = {
                                idioma: "desconocido",
                                transcripcion: sanitizeRawTranscriptionText(rawResponse || `[Error procesando audio bloque ${blockId}]`),
                                subtitulo: `Bloque ${blockId}`,
                                turnos_hablantes: []
                            };
                        }
                    }

                    if (myRevision !== sessionRevision) return;

                    // Almacenar resultados CON IDIOMA usando lookup por ID (sin índices stale)
                    const doneSeg = ensureSegmentById();
                    const cleanedTranscription = sanitizeRawTranscriptionText(result.transcripcion);
                    const previousRaw = typeof doneSeg.raw === "string" ? doneSeg.raw : "";
                    doneSeg.raw = cleanedTranscription;
                    doneSeg.original_raw = cleanedTranscription;
                    if (previousRaw !== doneSeg.raw) {
                        resetSegmentToneData(doneSeg);
                    }
                    if (!doneSeg.analyses) doneSeg.analyses = {};
                    doneSeg.analyses.structured = doneSeg.raw;
                    doneSeg.subtitle = result.subtitulo || `Bloque ${blockId}`;
                    doneSeg.idioma = result.idioma || "desconocido";
                    doneSeg.currentTone = localStorage.getItem("lastTone") || DEFAULT_TRANSCRIPTION_TONE;
                    doneSeg.status = "done";

                    // 🔥 AÑADIR DETECCIÓN DE VOCES
                    try {
                        const analisisVoces = await detectarVocesYHablantes(doneSeg.raw, result.turnos_hablantes);
                        if (myRevision !== sessionRevision) return;
                        const segAfterVoices = getSegmentById();
                        if (!segAfterVoices) return;

                        segAfterVoices.analisis_voces = analisisVoces;
                        applyContextSpeakerNamesToSegment(segAfterVoices);
                        
                        // Si hay múltiples personas, guardar también el texto dialogado
                        if (analisisVoces.total_personas > 1 && analisisVoces.texto_dialogado) {
                            segAfterVoices.texto_dialogado = analisisVoces.texto_dialogado;
                            // Mostrar formato diálogo por defecto cuando se detecta diálogo
                            segAfterVoices.vistaEstructurada = true;
                            segAfterVoices.vistaDialogoPlano = false;
                        }
                    } catch (error) {
                        const segAfterVoices = getSegmentById();
                        if (segAfterVoices) {
                            segAfterVoices.analisis_voces = null;
                        }
                    }

                    const finalSeg = getSegmentById();
                    if (!finalSeg) return;

                    // ✅ Actualizar UI
                    renderSegment(finalSeg);

                    // ✅ Mostrar notificación CON IDIOMA DETECTADO
                    const langMsg = finalSeg.idioma !== "desconocido" 
                        ? ` (Idioma: ${finalSeg.idioma})` 
                        : "";
                    showToast(`✅ Bloque ${blockId} procesado${langMsg}: ${result.subtitulo}`);
                    
                    // ✅ No aplicar tono automáticamente al transcribir.
                    // El tono solo debe cambiarse por acción explícita del usuario.
                    if (finalSeg.raw) {
                        deletePendingAudio(blockId);
                    }

                    // ✅ Guardar en Firebase
                    if (myRevision !== sessionRevision) return;
                    saveSessionToFirebase()
                        .then(() => {
                        })
                        .catch(err => {
                        });
                } catch (e) {
                    if (myRevision !== sessionRevision) return;
                    const errSeg = ensureSegmentById();
                    errSeg.status = 'error';
                    errSeg.error = e.message;
                    renderSegment(errSeg);
                    showToast(`❌ Error en bloque ${blockId}`);
                }
            }

            const analysisCache = new Map();
            const toneQueue = [];
            let toneQueueRunning = false;

            function enqueueToneGeneration(ids, tone) {
                if (!tone || tone === "raw") return;
                const list = Array.isArray(ids) ? ids : [ids];
                for (const id of list) {
                    if (!toneQueue.find(t => t.id === id && t.tone === tone)) {
                        toneQueue.push({ id, tone });
                    }
                }
                runToneQueue();
            }

            async function runToneQueue() {
                if (toneQueueRunning) return;
                toneQueueRunning = true;
                try {
                    while (toneQueue.length) {
                        const task = toneQueue.shift();
                        const seg = segmentsData.find(s => s.id === task.id);
                        if (!seg || seg.status !== "done" || !seg.raw) continue;
                        if (seg.analyses?.[task.tone]) {
                            seg.currentTone = task.tone;
                            renderSegment(seg);
                            continue;
                        }
                        await generateToneForSegment(task.id, task.tone);
                        await new Promise(r => setTimeout(r, 250));
                    }
                } finally {
                    toneQueueRunning = false;
                }
            }

            function sanitizeToneResponse(text) {
                if (!text) return "";
                let cleaned = String(text).trim();

                const fenceMatch = cleaned.match(/```(?:\\w+)?\\s*([\\s\\S]*?)\\s*```/);
                if (fenceMatch && fenceMatch[1]) {
                    cleaned = fenceMatch[1].trim();
                }

                cleaned = cleaned.replace(/^(?:Claro|Aqui tienes|Aquí tienes|Aquí está|Resultado|Respuesta|Texto transformado|Texto|Transformado|Salida)\\s*:\\s*/i, "");

                if ((cleaned.startsWith("\"") && cleaned.endsWith("\"")) || (cleaned.startsWith("“") && cleaned.endsWith("”"))) {
                    cleaned = cleaned.slice(1, -1).trim();
                }

                return cleaned.trim();
            }

            async function generateToneForSegment(blockId, tone) {
                const myRevision = sessionRevision;
                
                const index = segmentsData.findIndex(s => s.id === blockId);
                if (index === -1) return;
                const seg = segmentsData[index];
                if (seg.status === "processing") {
                    if (seg.generatingTone && seg.generatingTone === tone) return;
                    // Si quedó atascado en otro tono, reiniciar estado para continuar
                    seg.status = "done";
                    delete seg.generatingTone;
                }

                if (tone === "raw") {
                    seg.currentTone = "raw";
                    seg.status = "done";
                    delete seg.generatingTone;
                    renderSegment(seg);
                    await saveSessionToFirebase();
                    return;
                }
                
                if (!seg.analyses) seg.analyses = {};
                
                // 🟢 CLAVE DE CACHÉ: texto + tono + contexto de nota
                const toneContextHash = getToneContextHashForSegment(seg);
                const cacheKey = `${seg.raw}_${tone}_${toneContextHash}`;
                
                // ✅ VERIFICAR CACHÉ PRIMERO
                if (analysisCache.has(cacheKey)) {
                    seg.analyses[tone] = analysisCache.get(cacheKey);
                    setToneContextHashForSegment(seg, tone, toneContextHash);
                    seg.status = "done";
                    delete seg.generatingTone;
                    
                    // 🔥 IMPORTANTE: Actualizar el tono actual del segmento
                    seg.currentTone = tone;
                    await applyGeminiSpeakerNamesFromContext(seg);
                    
                    renderSegment(seg);
                    // Guardar en localStorage por sesión/bloque
                    if (currentSessionId && seg.raw) {
                        persistToneCacheEntry(currentSessionId, seg, tone);
                    }
                    await saveSessionToFirebase();
                    
                    
                    setTimeout(() => {
                        const blockElement = document.getElementById(`seg-${blockId}`);
                        if (blockElement) {
                            blockElement.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center' 
                            });
                        }
                    }, 100);
                    return;
                }
                
                // 🚫 Si no hay texto base
                if (!seg.raw) {
                    
                    seg.status = "done";
                    delete seg.generatingTone;
                    renderSegment(seg);
                    return;
                }
                
                // Marcar como procesando
                seg.generatingTone = tone;
                seg.status = "processing";
                renderSegment(seg);
                
                try {
                    const instruction = getInstruction(tone);
                    const contextNote = getBlockContextNote(seg.id);
                    const safeContextNote = contextNote ? contextNote.replace(/"""/g, '\\"\\"\\"') : "";
                    const contextSection = safeContextNote
                        ? `\n\nNOTA DE CONTEXTO DEL BLOQUE (OBLIGATORIA):\n"""${safeContextNote}"""\n\nREGLAS CRITICAS:\n- Debes fusionar el TEXTO ORIGINAL con esta NOTA de forma explicita en el resultado final.\n- No omitas la idea central de la nota; debe quedar claramente reflejada.\n- Si hay conflicto entre TEXTO ORIGINAL y NOTA, prioriza la NOTA y reescribe en consecuencia.\n- Usa solo informacion del TEXTO ORIGINAL y la NOTA; no agregues datos externos.`
                        : "";
                    const prompt = `Transforma el texto según este estilo: ${instruction}${contextSection}\n\nTEXTO ORIGINAL:\n"""${seg.raw}"""\n\nDevuelve SOLO el texto transformado, sin comentarios, sin prefacios, sin notas, sin comillas, sin markdown ni bloques de código.`;
                    
                    const response = await fetchGeminiTextOnly(prompt);
                    if (myRevision !== sessionRevision) return;
                    const cleanedResponse = sanitizeToneResponse(response);
                    
                    // 💾 GUARDAR EN CACHÉ Y ACTUALIZAR SEGMENTO
                    seg.analyses[tone] = cleanedResponse;
                    setToneContextHashForSegment(seg, tone, toneContextHash);
                    analysisCache.set(cacheKey, cleanedResponse);
                    
                    // 🔥 CRÍTICO: Actualizar el tono actual del segmento
                    seg.currentTone = tone;
                    await applyGeminiSpeakerNamesFromContext(seg);
                    
                    seg.status = "done";
                    delete seg.generatingTone;
                    renderSegment(seg);

                    // Guardar en localStorage por sesión/bloque
                    if (currentSessionId && seg.raw) {
                        persistToneCacheEntry(currentSessionId, seg, tone);
                    }
                    
                    if (myRevision !== sessionRevision) return;
                    await saveSessionToFirebase();
                    
                    setTimeout(() => {
                        const blockElement = document.getElementById(`seg-${blockId}`);
                        if (blockElement) {
                            blockElement.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center' 
                            });
                        }
                    }, 100);
                    
                    
                    
                } catch (e) {
                    if (myRevision !== sessionRevision) return;
                    seg.status = "error";
                    seg.error = e.message;
                    delete seg.generatingTone;
                    renderSegment(seg);
                    
                }
            }



            async function fetchGeminiContent(prompt, base64Data, mimeType) {
                const API_MODELS = [
                    selectGeminiEndpoint.value,           // modelo elegido por el usuario
                    "gemini-2.5-flash-lite",              // fallback 1
                    "gemini-2.5-flash",                   // fallback 2
                    "gemini-2.5-pro",                     // fallback 3
                    "gemini-3.5-flash",                   // fallback 4
                    "gemini-3-flash-preview",             // fallback 5
                    "gemini-2.0-flash",                   // fallback 6
                    "gemini-2.0-flash-lite"               // fallback 7
                ];

                const body = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: base64Data } }
                        ]
                    }]
                };

                for (let model of API_MODELS) {
                    try {

                        const { response: res, data: json } = await geminiBackendFetch("/api/gemini/generate", {
                            method: "POST",
                            body: JSON.stringify({ model, payload: body })
                        });
                        if (!res.ok || json.error) throw new Error(String(json?.error || `HTTP ${res.status}`));

                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) {
                            return text.trim();
                        }

                        throw new Error("Respuesta vacía del modelo.");
                    } catch (err) {
                        // continúa al siguiente modelo
                    }
                }

                throw new Error("Todos los modelos fallaron al generar contenido.");
            }

            async function fetchGeminiTextOnly(prompt, maxRetries = 3, preferredModel = null, strictModel = false) {
                const preferred = preferredModel || (selectGeminiEndpoint ? selectGeminiEndpoint.value : null);
                const models = strictModel && preferred
                    ? [preferred]
                    : [
                        preferred,
                        "gemini-2.5-flash-lite",
                        "gemini-2.5-flash",
                        "gemini-2.5-pro",
                        "gemini-3.5-flash",
                        "gemini-3-flash-preview",
                        "gemini-2.0-flash",
                        "gemini-2.0-flash-lite"
                    ].filter(Boolean);
                const API_MODELS = Array.from(new Set(models));

                if (!geminiAvailableModelsCache) {
                    geminiAvailableModelsCache = await getGeminiAvailableModels().catch(() => null);
                }
                const availableSet = geminiAvailableModelsCache
                    ? new Set(geminiAvailableModelsCache)
                    : null;
                const filteredModels = availableSet
                    ? API_MODELS.filter(m => availableSet.has(m))
                    : API_MODELS;

                const body = { contents: [{ parts: [{ text: prompt }] }] };

                if (availableSet && preferred && !availableSet.has(preferred)) {
                    showToast(`Modelo no disponible: ${preferred}`);
                }

                for (let model of filteredModels) {
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 60000);
                            const { response: res, data: json } = await geminiBackendFetch("/api/gemini/generate", {
                                method: "POST",
                                body: JSON.stringify({ model, payload: body }),
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            
                            // Manejar errores HTTP
                            if (!res.ok) {
                                if (res.status === 429 || res.status >= 500) {
                                    // Error de tasa límite o servidor - reintentar con backoff
                                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                                    await new Promise(resolve => setTimeout(resolve, delay));
                                    continue;
                                }
                                if (res.status === 404 && availableSet) {
                                    availableSet.delete(model);
                                    geminiAvailableModelsCache = Array.from(availableSet);
                                }
                                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                            }
                            
                            if (json.error) {
                                throw json.error;
                            }
                            
                            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) {
                                return text.trim();
                            }
                            
                            throw new Error("Respuesta vacía del modelo");
                            
                        } catch (err) {
                            
                            // Si es el último intento con este modelo, continuar al siguiente
                            if (attempt === maxRetries) {
                                break;
                            }
                        }
                    }
                }
                
                throw new Error("Todos los modelos e intentos fallaron");
            }

            async function getGeminiAvailableModels() {
                const { response: res, data: json } = await geminiBackendFetch("/api/gemini/models", { method: "GET" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const models = (json.models || []).map(m => m.name?.replace("models/", "")).filter(Boolean);
                return models;
            }

            async function syncGeminiModelOptions() {
                if (!selectGeminiEndpoint) return;
                let available = null;
                try {
                    available = await getGeminiAvailableModels();
                } catch {
                    return;
                }
                const availableSet = new Set(available || []);
                const options = Array.from(selectGeminiEndpoint.options);
                options.forEach(opt => {
                    const baseText = opt.textContent.replace(" (No disponible)", "");
                    if (!availableSet.has(opt.value)) {
                        opt.disabled = true;
                        opt.textContent = `${baseText} (No disponible)`;
                    } else {
                        opt.disabled = false;
                        opt.textContent = baseText;
                    }
                });
                if (availableSet.size) {
                    const current = selectGeminiEndpoint.value;
                    if (!availableSet.has(current)) {
                        const first = options.find(o => !o.disabled);
                        if (first) selectGeminiEndpoint.value = first.value;
                    }
                }
            }

            setTimeout(() => {
                syncGeminiModelOptions();
            }, 0);

            function getInstruction(tone) {
                switch (tone) {
                    case 'raw':
                    return "Devuelve el texto original, sin modificaciones ni análisis.";
                    case 'structured':
                    return "No cambies el sentido del texto. Solo organízalo y estructúralo mejor con secciones claras, títulos breves, párrafos ordenados y listas cuando aporte claridad.";
                    case 'scientific':
                    return "Reescribe con precisión científica y vocabulario técnico.";
                    case 'academic':
                    return "Reescribe con estilo académico formal y estructura lógica.";
                    case 'analysis':
                    return "Analiza los puntos clave con lenguaje técnico y razonado.";
                    case 'teaching':
                    return "Convierte el texto en una explicación clara, paso a paso, estilo docente.";
                    case 'literary':
                    return "Reescribe el texto con un tono narrativo o literario, enfatizando ritmo y emoción.";
                    case 'child':
                    return "Adapta el texto para un público infantil, usando lenguaje simple y alegre.";
                    case 'formal':
                    return "Usa un tono formal, corporativo o institucional, evitando coloquialismos.";
                    case 'poetic':
                    return "Transforma el texto con un estilo poético, evocador y emocional.";
                    case 'journalistic':
                    return "Reescribe el texto con un estilo periodístico, directo y noticioso.";
                    case 'conversational':
                    return "Reescribe el texto con tono natural, cercano y dialogado, como una conversación.";
                    case 'humorous':
                    return "Adapta el texto con un toque de humor, ingenio o ironía.";
                    default:
                    return "Mantén el texto coherente, claro y bien redactado.";
                }
            }


            function getSessionInstruction(type) {
                switch (type) {
                    case 'resumen':
                        return `
                            Genera un RESUMEN GENERAL de la sesión.
                            - Extrae los puntos clave.
                            - Agrupa por temas o bloques lógicos.
                            - Usa listas con viñetas para elementos.
                            - No repitas literalmente la transcripción.
                        `;
                    case 'analisis':
                        return `
                            Realiza un ANÁLISIS CRÍTICO de la sesión.
                            - Identifica objetivos explícitos o implícitos.
                            - Señala aciertos, errores, dudas y oportunidades de mejora.
                            - Incluye un apartado final de conclusiones y recomendaciones.
                        `;
                    case 'sintesis':
                        return `
                            Produce una SÍNTESIS EJECUTIVA MUY BREVE (máx. 8 líneas).
                            - Pensada para alguien que no estuvo en la sesión.
                            - Enfócate en qué se habló, qué se decidió y próximos pasos.
                        `;
                    case 'curso':
                        return `
                            Diseña una PROPUESTA DE CURSO / TEMARIO basada en la sesión.
                            - Define título del curso.
                            - Estructura en módulos o unidades numeradas.
                            - Para cada módulo: objetivo, contenidos clave y posibles actividades.
                        `;
                    case 'ideas':
                        return `
                            Extrae IDEAS CLAVE y TAREAS ACCIONABLES.
                            - Lista de ideas principales (bullets).
                            - Lista de tareas accionables con verbos en infinitivo (por ejemplo: "Definir...", "Preparar...").
                            - Si no se hablan de tareas explícitamente, infiere las más razonables.
                        `;
                    case 'audiolibro':
                        return `
                            Redacta el texto en formato narrativo para un audiolibro.
                            - Mantén un tono claro y continuo.
                            - Evita listas muy técnicas; usa párrafos fluidos.
                            - Usa español neutro.
                            - No añadas comentarios, notas ni explicaciones; solo el resultado final.
                            - Es un escrito extenso, bien explicado y muy detallado con todos los puntos clave.
                            - Profundiza en cada idea importante: contexto, causas, consecuencias y matices.
                            - Explica bien los conceptos y desarrolla cada uno con claridad.
                            - Incluye ejemplos prácticos y analogías cuando ayuden a comprender.
                            - Si hay procesos o pasos, descríbelos narrativamente con detalles.
                            - No resumas en exceso; prioriza profundidad y detalle.
                        `;
                    default:
                        return `
                            Resume y analiza la sesión de forma estructurada.
                        `;
                }
            }


            // -----------------------------------------------------------
            // FUNCIÓN MEJORADA PARA GENERAR ANÁLISIS CON CACHÉ
            // -----------------------------------------------------------
            async function generateSessionSummary(type = 'resumen', forceNew = false, tone = 'raw', cacheOnly = false) {
                let fullText = "";
                let cacheKey = "";
                const isMulti = window.aiModalMode === 'multi';
                const selectedModel = selectGeminiEndpoint ? selectGeminiEndpoint.value : "";
                const extraInstructions = document.getElementById('aiSummaryExtra')?.value?.trim() || "";
                const extraKey = extraInstructions ? quickHash(extraInstructions) : "none";
                const resolvedTone = tone || 'raw';
                const toneKey = resolvedTone !== 'raw' ? `${type}_${resolvedTone}` : type;
                const modeKey = window.aiModalMode || "global";
                const blockKey = window.aiModalBlockId ? `block_${window.aiModalBlockId}` : "all";
                const requestKey = `${modeKey}_${blockKey}_${toneKey}_${selectedModel}_${extraKey}`;
                if (!window.aiSummaryRequestCounter) window.aiSummaryRequestCounter = 0;
                if (!window.aiSummaryActiveRequest) window.aiSummaryActiveRequest = 0;
                if (!forceNew && window.aiSummaryInFlightKey === requestKey) {
                    return;
                }
                window.aiSummaryInFlightKey = requestKey;
                const requestId = ++window.aiSummaryRequestCounter;
                window.aiSummaryActiveRequest = requestId;
                
                // 🔥 VERIFICAR MODO: BLOQUE ESPECÍFICO O SESIÓN COMPLETA
                if (isMulti) {
                    const ids = Array.isArray(window.aiModalSelectedIds) ? window.aiModalSelectedIds : [];
                    if (!ids.length) {
                        document.getElementById('aiSummaryResult').innerHTML = `
                            <p class="text-sm text-red-600">
                                No hay sesiones seleccionadas.
                            </p>
                        `;
                        return;
                    }

                    const normalizeCreatedAt = (createdAt) => {
                        if (!createdAt) return 0;
                        if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
                        if (typeof createdAt._seconds === "number") return createdAt._seconds * 1000;
                        if (createdAt instanceof Date) return createdAt.getTime();
                        return 0;
                    };

                    const entries = await Promise.all(ids.map(async (id) => {
                        try {
                            const sessionRef = doc(db, "audioTranslate", id);
                            const sessionDoc = await getDoc(sessionRef);
                            if (!sessionDoc.exists()) return null;
                            const data = sessionDoc.data();
                            const createdAtMs = normalizeCreatedAt(data.createdAt);
                            const title = data.title || `Sesión ${id}`;
                            const segments = Array.isArray(data.segments)
                                ? data.segments
                                : Object.values(data.segments || {});
                            const text = segments
                                .filter(s => s.raw && typeof s.raw === 'string')
                                .map(s => s.raw)
                                .join('\n\n');
                            return { id, title, text, createdAtMs };
                        } catch (err) {
                            return null;
                        }
                    }));

                    const ordered = entries
                        .filter(Boolean)
                        .sort((a, b) => {
                            if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
                            return String(a.id).localeCompare(String(b.id));
                        });

                    const sections = ordered
                        .filter(item => item.text && item.text.trim().length > 0)
                        .map(item => `### ${item.title}\n${item.text}`);

                    fullText = sections.join('\n\n---\n\n');
                    const idsKey = ids.slice().sort().join('|');
                    cacheKey = `multi_${idsKey}_${toneKey}_${selectedModel}_${extraKey}`;

                } else if (window.aiModalMode === 'block' && window.aiModalBlockId) {
                    // MODO BLOQUE: Solo analizar el bloque actual
                    const segment = segmentsData.find(s => s.id === window.aiModalBlockId);
                    if (!segment || !segment.raw) {
                        document.getElementById('aiSummaryResult').innerHTML = `
                            <p class="text-sm text-red-600">
                                Este bloque no tiene texto para analizar.
                            </p>
                        `;
                        return;
                    }
                    fullText = segment.raw;
                    cacheKey = `${currentSessionId}_block_${window.aiModalBlockId}_${toneKey}_${selectedModel}_${extraKey}`;
                    
                } else {
                    // MODO GLOBAL: Analizar toda la sesión
                    fullText = segmentsData
                        .filter(s => s.raw && s.status === 'done')
                        .map(s => s.raw)
                        .join('\n\n');
                    cacheKey = `${currentSessionId}_${toneKey}_${selectedModel}_${extraKey}`;
                    
                }





                if (!fullText || fullText.trim().length < 5) {
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <p class="text-sm text-red-600">
                            No hay suficiente texto transcrito para generar un resultado.
                        </p>
                    `;
                    return;
                }

                // 1. VERIFICAR SI YA EXISTE EN CACHÉ/FIREBASE
                let cachedAnalysis = null;
                if (!forceNew && cacheKey) {
                    try {
                        // Buscar en caché local primero
                        const localCache = localStorage.getItem(cacheKey);
                        
                        if (localCache) {
                            const parsed = JSON.parse(localCache);
                            // Verificar si el texto base es el mismo
                            const textHash = await generateTextHash(fullText);
                            if (parsed.textHash === textHash && parsed.model === selectedModel) {
                                cachedAnalysis = parsed.content;
                            } else {
                            }
                        }
                        
                        // Si no hay en caché local, buscar en Firebase
                        let sessionData = null;
                        if (!cachedAnalysis && isFirebaseActive && !isMulti && currentSessionId) {
                            const sessionRef = doc(db, "audioTranslate", currentSessionId);
                            const sessionDoc = await getDoc(sessionRef);
                            
                            if (sessionDoc.exists()) {
                                sessionData = sessionDoc.data();
                                const refId = sessionData?.analysisRefs?.[toneKey]?.[selectedModel];
                                if (refId) {
                                    try {
                                        const refSnap = await getDoc(doc(db, "audioTranslateAnalyses", refId));
                                        if (refSnap.exists()) {
                                            const d = refSnap.data() || {};
                                            if (d.content) {
                                                cachedAnalysis = d.content;
                                            } else if (d.url) {
                                                const res = await fetch(d.url, { cache: "no-store" });
                                                if (res.ok) {
                                                    cachedAnalysis = await res.text();
                                                }
                                            }
                                            if (cachedAnalysis) {
                                                const textHash = await generateTextHash(fullText);
                                                localStorage.setItem(cacheKey, JSON.stringify({
                                                    content: cachedAnalysis,
                                                    textHash: textHash,
                                                    model: selectedModel,
                                                    timestamp: Date.now()
                                                }));
                                            }
                                        }
                                    } catch (e) {
                                    }
                                }
                                const byModel = sessionData.synthesesByModel?.[selectedModel]?.[toneKey];
                                if (byModel) {
                                    // También deberíamos verificar si el texto base es el mismo
                                    // Para simplificar, asumimos que si existe, es válido
                                    cachedAnalysis = byModel;
                                    
                                    // Guardar en caché local
                                    const textHash = await generateTextHash(fullText);
                                    localStorage.setItem(cacheKey, JSON.stringify({
                                        content: cachedAnalysis,
                                        textHash: textHash,
                                        model: selectedModel,
                                        timestamp: Date.now()
                                    }));
                                }
                            }
                        }
                        
                        // Si sigue sin existir, buscar en colección auxiliar (Storage URL)
                        if (!cachedAnalysis && isFirebaseActive && !isMulti && currentSessionId) {
                            try {
                                const summarySnap = await getDoc(doc(db, "audioTranslateSummaries", `${currentSessionId}_${toneKey}`));
                                if (summarySnap.exists()) {
                                    const data = summarySnap.data() || {};
                                    if (data.url) {
                                        const res = await fetch(data.url, { cache: "no-store" });
                                        if (res.ok) {
                                            const text = await res.text();
                                            if (text && text.trim()) {
                                                cachedAnalysis = text;
                                                const textHash = await generateTextHash(fullText);
                                                localStorage.setItem(cacheKey, JSON.stringify({
                                                    content: cachedAnalysis,
                                                    textHash: textHash,
                                                    model: selectedModel,
                                                    timestamp: Date.now()
                                                }));
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                            }
                        }

                        // Fallback: si no hay para el modelo seleccionado y estamos en modo cacheOnly,
                        // buscar en cualquier modelo guardado.
                        if (!cachedAnalysis && cacheOnly && sessionData) {
                            const refMap = sessionData.analysisRefs?.[toneKey] || {};
                            const refIds = Object.values(refMap);
                            for (const refId of refIds) {
                                try {
                                    const refSnap = await getDoc(doc(db, "audioTranslateAnalyses", refId));
                                    if (refSnap.exists()) {
                                        const d = refSnap.data() || {};
                                        if (d.content) {
                                            cachedAnalysis = d.content;
                                        } else if (d.url) {
                                            const res = await fetch(d.url, { cache: "no-store" });
                                            if (res.ok) cachedAnalysis = await res.text();
                                        }
                                        if (cachedAnalysis) {
                                            const textHash = await generateTextHash(fullText);
                                            localStorage.setItem(cacheKey, JSON.stringify({
                                                content: cachedAnalysis,
                                                textHash: textHash,
                                                model: d.model || selectedModel,
                                                timestamp: Date.now()
                                            }));
                                            break;
                                        }
                                    }
                                } catch (e) {
                                }
                            }
                        }
                        if (!cachedAnalysis && cacheOnly && sessionData && sessionData.synthesesByModel) {
                            const models = Object.keys(sessionData.synthesesByModel || {});
                            for (const m of models) {
                                const val = sessionData.synthesesByModel?.[m]?.[toneKey];
                                if (val) {
                                    cachedAnalysis = val;
                                    const textHash = await generateTextHash(fullText);
                                    localStorage.setItem(cacheKey, JSON.stringify({
                                        content: cachedAnalysis,
                                        textHash: textHash,
                                        model: m,
                                        timestamp: Date.now()
                                    }));
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                    }
                }

                // 2. SI EXISTE CACHÉ, MOSTRARLO
                if (cachedAnalysis && !forceNew) {
                    if (requestId !== window.aiSummaryActiveRequest) return;
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <div class="text-sm text-emerald-600 font-medium flex items-center gap-2">
                                    <i class="fa-solid fa-database"></i>
                                    <span>Cargado desde caché</span>
                                </div>
                                <button id="btnForceNewAnalysis" 
                                        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                                    <i class="fa-solid fa-rotate-right mr-1"></i>
                                    Regenerar
                                </button>
                            </div>
                            <div class="prose prose-sm max-w-none text-slate-800 border-t border-slate-200 pt-4">
                                ${sanitizeAssistantBubbleHtml(formatText(cachedAnalysis))}
                            </div>
                        </div>
                    `;
                    
                    // Event listener para el botón de regenerar
                    document.getElementById('btnForceNewAnalysis').addEventListener('click', () => {
                        generateSessionSummary(type, true, resolvedTone);
                    });
                    if (requestId === window.aiSummaryActiveRequest) {
                        window.aiSummaryInFlightKey = null;
                    }
                    return;
                }
                if (cacheOnly) {
                    if (requestId !== window.aiSummaryActiveRequest) return;
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <p class="text-sm text-slate-500">
                            No hay análisis guardado para este tipo y tono.
                        </p>
                    `;
                    if (requestId === window.aiSummaryActiveRequest) {
                        window.aiSummaryInFlightKey = null;
                    }
                    return;
                }

                if (type === 'audiolibro') {
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <div class="space-y-2">
                            <div class="flex items-center gap-2 text-indigo-600 text-sm">
                                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10"
                                            stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2
                                            5.291A7.962 7.962 0 014 12H0c0 3.042 1.135
                                            5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generando texto para audiolibro...
                            </div>
                            <p class="text-xs text-slate-500">Esto puede tardar. No cierres esta ventana.</p>
                        </div>
                    `;

                    try {
                        const instruction = getSessionInstruction('audiolibro');
                        const prompt = `
                            TRANSCRIPCIÓN (segmentos concatenados):
                            """${fullText}"""

                            TAREA:
                            ${instruction}

                            INSTRUCCIONES EXTRA (si aplica):
                            ${extraInstructions || "Ninguna"}

                            REGLAS:
                            - Entrega SOLO el texto final.
                            - No agregues comentarios, notas, explicaciones ni encabezados extra.
                            - No digas "Aquí tienes", "Claro", "Resumen", etc.
                        `;
                        const textoAudiolibro = await fetchGeminiTextOnly(prompt, 3, selectedModel, true);
                        if (!textoAudiolibro || !textoAudiolibro.trim()) {
                            throw new Error("No se obtuvo texto del audiolibro.");
                        }

                        if (requestId !== window.aiSummaryActiveRequest) return;
                        document.getElementById('aiSummaryResult').innerHTML = `
                            <div class="space-y-3">
                                    <div class="flex items-center justify-between">
                                        <div class="text-sm text-emerald-600 font-medium flex items-center gap-2">
                                            <i class="fa-solid fa-circle-check"></i>
                                            <span>Audiolibro generado</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button id="btnAudiobookVoiceLocale" class="text-xs text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-2" title="Cambiar nacionalidad/acento de la voz">
                                                <i class="fa-solid fa-flag"></i>
                                                <span>Voz</span>
                                            </button>
                                            <button id="btnAudiobookVoiceTone" class="text-xs text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-2" title="Cambiar tono de voz">
                                                <i class="fa-solid fa-wave-square"></i>
                                                <span>Tono</span>
                                            </button>
                                            <button id="btnAudiobookVoiceSpeed" class="text-xs text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-2" title="Cambiar velocidad de reproducción">
                                                <i class="fa-solid fa-gauge-high"></i>
                                                <span>Velocidad</span>
                                            </button>
                                            <button id="btnPlayAudiobook" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2">
                                                <i class="fa-solid fa-play"></i>
                                                Reproducir
                                            </button>
                                        <button id="btnDownloadAudiobook" class="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-2">
                                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                            Crear audio (Clipchamp)
                                        </button>
                                    </div>
                                </div>
                                <div class="prose prose-sm max-w-none text-slate-800 border-t border-slate-200 pt-4" id="audiobookText">
                                    ${formatText(textoAudiolibro)}
                                </div>
                            </div>
                        `;

                        const playBtn = document.getElementById("btnPlayAudiobook");
                        if (playBtn) {
                            playBtn.addEventListener("click", () => {
                                toggleAudiobookPlayback(textoAudiolibro, playBtn);
                            });
                        }
                        const localeBtn = document.getElementById("btnAudiobookVoiceLocale");
                        if (localeBtn) {
                            localeBtn.addEventListener("click", () => {
                                cycleAudiobookLocale();
                            });
                        }
                        const toneBtn = document.getElementById("btnAudiobookVoiceTone");
                        if (toneBtn) {
                            toneBtn.addEventListener("click", () => {
                                cycleAudiobookTone();
                            });
                        }
                        const speedBtn = document.getElementById("btnAudiobookVoiceSpeed");
                        if (speedBtn) {
                            speedBtn.addEventListener("click", () => {
                                cycleAudiobookSpeed();
                            });
                        }
                        const downloadBtn = document.getElementById("btnDownloadAudiobook");
                        if (downloadBtn) {
                            downloadBtn.addEventListener("click", () => {
                                window.open("https://app.clipchamp.com/", "_blank", "noopener");
                            });
                        }
                    } catch (err) {
                        if (requestId !== window.aiSummaryActiveRequest) return;
                        document.getElementById('aiSummaryResult').innerHTML = `
                            <div class="text-sm text-red-600">No se pudo generar el audiolibro.</div>
                        `;
                    }
                    if (requestId === window.aiSummaryActiveRequest) {
                        window.aiSummaryInFlightKey = null;
                    }
                    return;
                }

                // 3. SI NO HAY CACHÉ O FORCE_NEW, GENERAR NUEVO
                const instruction = getSessionInstruction(type);
                const toneInstruction = resolvedTone !== 'raw'
                    ? `\nTONO:\n- Usa un estilo ${getActionLabel(resolvedTone)}.\n`
                    : "";

                const prompt = `
                    Estás analizando la TRANSCRIPCIÓN COMPLETA de una sesión de voz.

                    TRANSCRIPCIÓN (segmentos concatenados):
                    """${fullText}"""

                    TAREA:
                    ${instruction}

                    INSTRUCCIONES EXTRA (si aplica):
                    ${extraInstructions || "Ninguna"}

                    ${toneInstruction}

                    FORMATO:
                    - Escribe en español neutro.
                    - Encabezados 
                    - Listas con viñetas
                    - Párrafos cortos separados por líneas en blanco.
                    - No incluyas la transcripción original, solo tu resultado.
                    - No agregues comentarios, notas, explicaciones ni encabezados extra fuera del resultado.
                    - Entrega únicamente el contenido final, sin prefacios (ej. "Aquí tienes").
                `;

                // Mostrar loading
                document.getElementById('aiSummaryResult').innerHTML = `
                    <div class="space-y-3">
                        <div class="flex items-center gap-2 text-indigo-600 text-sm">
                            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10"
                                        stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2
                                        5.291A7.962 7.962 0 014 12H0c0 3.042 1.135
                                        5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generando análisis ${type} (${getActionLabel(resolvedTone)}) con Gemini...
                        </div>
                        <p class="text-xs text-slate-500">
                            Esto puede tomar unos segundos. Evita generar contenido similar para ahorrar tokens.
                        </p>
                    </div>
                `;

                try {
                    const result = await fetchGeminiTextOnly(prompt, 3, selectedModel, true);
                    const safe = result && result.trim().length > 0
                        ? result
                        : "No se obtuvo respuesta útil de la IA.";

                    // 4. GUARDAR EN CACHÉ Y FIREBASE
                    if (cacheKey) {
                        // Guardar en caché local
                        const textHash = await generateTextHash(fullText);
                        
                        localStorage.setItem(cacheKey, JSON.stringify({
                            content: safe,
                            textHash: textHash,
                            model: selectedModel,
                            timestamp: Date.now()
                        }));
                        

                        // Guardar en Firebase
                        if (isFirebaseActive && !isMulti && currentSessionId) {
                            try {
                                if (currentSessionOwnerId && auth?.currentUser?.uid && currentSessionOwnerId !== auth.currentUser.uid) {
                                    return;
                                }
                                const sessionRef = doc(db, "audioTranslate", currentSessionId);
                                const estimatedBytes = new TextEncoder().encode(safe).length;
                                if (estimatedBytes < 400_000) {
                                await updateDoc(sessionRef, {
                                    [`synthesesByModel.${selectedModel}.${toneKey}`]: safe,
                                    lastUpdated: serverTimestamp()
                                });
                                } else {
                                    const path = `syntheses/${currentSessionId}/${toneKey}-${Date.now()}.txt`;
                                    const ref = storageRef(storage, path);
                                    await uploadBytes(ref, new Blob([safe], { type: "text/plain" }));
                                    const url = await getDownloadURL(ref);
                                    await setDoc(doc(db, "audioTranslateSummaries", `${currentSessionId}_${toneKey}`), {
                                        sessionId: currentSessionId,
                                        type,
                                        tone: resolvedTone,
                                        model: selectedModel,
                                        url,
                                        createdAt: serverTimestamp()
                                    }, { merge: true });
                                }
                            } catch (e) {
                                const msg = String(e?.message || e);
                                if (msg.includes("exceeds the maximum allowed size")) {
                                    try {
                                        const path = `syntheses/${currentSessionId}/${toneKey}-${Date.now()}.txt`;
                                        const ref = storageRef(storage, path);
                                        await uploadBytes(ref, new Blob([safe], { type: "text/plain" }));
                                        const url = await getDownloadURL(ref);
                                        await setDoc(doc(db, "audioTranslateSummaries", `${currentSessionId}_${toneKey}`), {
                                            sessionId: currentSessionId,
                                            type,
                                            tone: resolvedTone,
                                            model: selectedModel,
                                            url,
                                            createdAt: serverTimestamp()
                                        }, { merge: true });
                                    } catch (inner) {
                                    }
                                } else {
                                }
                            }
                        }
                    }

                    // 5. MOSTRAR RESULTADO
                    if (requestId !== window.aiSummaryActiveRequest) return;
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <div class="text-sm text-indigo-600 font-medium flex items-center gap-2">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                                    <span>Generado nuevo</span>
                                </div>
                                <div class="flex gap-2">
                                    <button id="btnCopyAnalysis" 
                                            class="text-xs text-slate-600 hover:text-slate-800 font-medium px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                        <i class="fa-solid fa-copy mr-1"></i>
                                        Copiar
                                    </button>
                                    <button id="btnRegenerateAnalysis" 
                                            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                                        <i class="fa-solid fa-rotate-right mr-1"></i>
                                        Regenerar
                                    </button>
                                </div>
                            </div>
                            <div class="prose prose-sm max-w-none text-slate-800 border-t border-slate-200 pt-4">
                                ${sanitizeAssistantBubbleHtml(formatText(safe))}
                            </div>
                        </div>
                    `;

                    // Event listeners para botones
                    document.getElementById('btnCopyAnalysis').addEventListener('click', () => {
                        navigator.clipboard.writeText(safe);
                        showToast("📋 Análisis copiado al portapapeles");
                    });
                    
                    document.getElementById('btnRegenerateAnalysis').addEventListener('click', () => {
                        generateSessionSummary(type, true, resolvedTone);
                    });

                    window.lastGeneratedAnalysis = {
                        type,
                        tone: resolvedTone,
                        model: selectedModel,
                        content: safe
                    };

                } catch (e) {
                    if (requestId !== window.aiSummaryActiveRequest) return;
                    document.getElementById('aiSummaryResult').innerHTML = `
                        <div class="space-y-2">
                            <div class="text-sm text-red-600 font-medium flex items-center gap-2">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                <span>Error generando análisis</span>
                            </div>
                            <p class="text-sm text-red-500">
                                ${escapeHtmlText(e.message || "Error desconocido")}
                            </p>
                            <button id="btnRetrySummary" 
                                    class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                                <i class="fa-solid fa-rotate-right mr-1"></i>
                                Intentar de nuevo
                            </button>
                        </div>
                    `;
                    const retryBtn = document.getElementById('btnRetrySummary');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => {
                            generateSessionSummary(type, true, resolvedTone);
                        });
                    }
                } finally {
                    if (requestId === window.aiSummaryActiveRequest) {
                        window.aiSummaryInFlightKey = null;
                    }
                }
            }

            function base64ToUint8Array(base64) {
                const binary = atob(base64);
                const len = binary.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return bytes;
            }

            function concatUint8Arrays(chunks) {
                const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
                const result = new Uint8Array(totalLength);
                let offset = 0;
                chunks.forEach(chunk => {
                    result.set(chunk, offset);
                    offset += chunk.length;
                });
                return result;
            }

            function pcmToWav(pcmData, sampleRate = 24000, numChannels = 1) {
                const bytesPerSample = 2;
                const blockAlign = numChannels * bytesPerSample;
                const byteRate = sampleRate * blockAlign;
                const dataSize = pcmData.byteLength;
                const buffer = new ArrayBuffer(44 + dataSize);
                const view = new DataView(buffer);

                const writeString = (offset, str) => {
                    for (let i = 0; i < str.length; i++) {
                        view.setUint8(offset + i, str.charCodeAt(i));
                    }
                };

                writeString(0, "RIFF");
                view.setUint32(4, 36 + dataSize, true);
                writeString(8, "WAVE");
                writeString(12, "fmt ");
                view.setUint32(16, 16, true);
                view.setUint16(20, 1, true);
                view.setUint16(22, numChannels, true);
                view.setUint32(24, sampleRate, true);
                view.setUint32(28, byteRate, true);
                view.setUint16(32, blockAlign, true);
                view.setUint16(34, 16, true);
                writeString(36, "data");
                view.setUint32(40, dataSize, true);

                new Uint8Array(buffer, 44).set(pcmData);
                return buffer;
            }

            async function synthesizeAudiobookPcm(text) {
                void text;
                throw new Error(LIVE_AUDIO_DISABLED_MESSAGE);
            }

            async function synthesizeAudiobookPcmWithTimeout(text, timeoutMs) {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("Timeout generando audio.")), timeoutMs);
                });
                return Promise.race([synthesizeAudiobookPcm(text), timeoutPromise]);
            }

            async function synthesizeAudiobookPcmLong(text, timeoutMs = 210000, onProgress = null) {
                let chunks = splitTextForAudio(text, 3500);
                if (!chunks.length) return { pcm: new Uint8Array(), sampleRate: 24000 };

                const pcmParts = [];
                let sampleRate = 24000;
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    if (onProgress) onProgress(i + 1, chunks.length);
                    try {
                        const { pcm, sampleRate: sr } = await synthesizeAudiobookPcmWithTimeout(chunk, timeoutMs);
                        sampleRate = sr || sampleRate;
                        pcmParts.push(pcm);
                    } catch (err) {
                        // Reintentar con chunk más pequeño si falla
                        const smaller = splitTextForAudio(chunk, 1800);
                        if (smaller.length <= 1) throw err;
                        const insertAt = i + 1;
                        chunks.splice(i, 1, ...smaller);
                        i -= 1;
                        if (onProgress) onProgress(i + 1, chunks.length);
                    }
                }

                return { pcm: concatUint8Arrays(pcmParts), sampleRate };
            }

            async function generateAudiobookAudio(text, title, sessionId) {
                if (!storage) {
                    throw new Error("Storage no inicializado.");
                }

                const { pcm, sampleRate } = await synthesizeAudiobookPcm(text);

                const wavBuffer = pcmToWav(pcm, sampleRate, 1);
                const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
                const safeTitle = (title || "audiolibro").replace(/[^\w\-]+/g, "_").slice(0, 60);
                const path = `audiolibros/${sessionId || "multi"}/${safeTitle}-${Date.now()}.wav`;
                const ref = storageRef(storage, path);
                await uploadBytes(ref, wavBlob);
                const url = await getDownloadURL(ref);

                if (sessionId && isFirebaseActive) {
                    try {
                        if (currentSessionOwnerId && auth?.currentUser?.uid && currentSessionOwnerId !== auth.currentUser.uid) {
                            return { url, path };
                        }
                        const sessionRef = doc(db, "audioTranslate", sessionId);
                        await updateDoc(sessionRef, {
                            "syntheses.audiolibroUrl": url,
                            lastUpdated: serverTimestamp()
                        });
                    } catch (err) {
                    }
                }

                return { url, path };
            }

            function pcmToInt16(pcmBytes) {
                const buf = pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength);
                const view = new DataView(buf);
                const samples = new Int16Array(pcmBytes.byteLength / 2);
                for (let i = 0; i < samples.length; i++) {
                    samples[i] = view.getInt16(i * 2, true);
                }
                return samples;
            }

            function encodeMp3FromPcm(pcmBytes, sampleRate) {
                if (!window.lamejs) {
                    throw new Error("Encoder MP3 no disponible.");
                }
                const samples = pcmToInt16(pcmBytes);
                const mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
                const blockSize = 1152;
                const mp3Data = [];
                for (let i = 0; i < samples.length; i += blockSize) {
                    const chunk = samples.subarray(i, i + blockSize);
                    const buf = mp3Encoder.encodeBuffer(chunk);
                    if (buf.length) mp3Data.push(buf);
                }
                const end = mp3Encoder.flush();
                if (end.length) mp3Data.push(end);
                return new Blob(mp3Data, { type: "audio/mpeg" });
            }

            let currentAudiobookUtterance = null;
            let isAudiobookPaused = false;
            let audiobookQueue = [];
            let audiobookIndex = 0;
            let audiobookActiveButton = null;
            let audiobookVoiceLocale = "es-ES";
            let audiobookVoiceRate = 0.92;
            let audiobookVoicePitch = 1.0;
            let audiobookVoiceStyle = "neutral";
            let audiobookCurrentText = "";

            function pickFriendlyVoiceForLocale(locale) {
                const voices = window.speechSynthesis.getVoices() || [];
                if (!voices.length) return null;
                const localeLower = (locale || "").toLowerCase();
                const matching = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(localeLower.slice(0, 2)));
                const list = matching.length ? matching : voices;
                const preferred = list.find(v => /neural|natural|premium|google|microsoft/i.test(v.name)) ||
                                 list.find(v => /female|femenina|mujer/i.test(v.name));
                return preferred || list[0] || null;
            }

            function splitTextForSpeech(text, maxLen = 1400) {
                const chunks = [];
                let remaining = text.trim();
                while (remaining.length > maxLen) {
                    let cut = remaining.lastIndexOf(". ", maxLen);
                    if (cut < 400) {
                        cut = remaining.lastIndexOf(" ", maxLen);
                    }
                    if (cut < 200) cut = maxLen;
                    chunks.push(remaining.slice(0, cut + 1).trim());
                    remaining = remaining.slice(cut + 1).trim();
                }
                if (remaining.length) chunks.push(remaining);
                return chunks;
            }

            function splitTextForAudio(text, maxLen = 3500) {
                const chunks = [];
                let remaining = text.trim();
                while (remaining.length > maxLen) {
                    let cut = remaining.lastIndexOf(". ", maxLen);
                    if (cut < 800) {
                        cut = remaining.lastIndexOf(" ", maxLen);
                    }
                    if (cut < 400) cut = maxLen;
                    chunks.push(remaining.slice(0, cut + 1).trim());
                    remaining = remaining.slice(cut + 1).trim();
                }
                if (remaining.length) chunks.push(remaining);
                return chunks;
            }

            function buildUtterance(text) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = audiobookVoiceLocale || "es-ES";
                utterance.rate = audiobookVoiceRate || 1.0;
                utterance.pitch = audiobookVoicePitch || 1.0;
                utterance.volume = 1;
                const voice = pickFriendlyVoiceForLocale(audiobookVoiceLocale);
                if (voice) utterance.voice = voice;
                return utterance;
            }

            function stripSpeechFormatting(text) {
                if (!text) return "";
                return text
                    .replace(/```[\s\S]*?```/g, " ") // code blocks
                    .replace(/`([^`]+)`/g, "$1") // inline code
                    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
                    .replace(/__(.*?)__/g, "$1")
                    .replace(/\*(.*?)\*/g, "$1") // italics
                    .replace(/_(.*?)_/g, "$1")
                    .replace(/^#{1,6}\s+/gm, "") // headings
                    .replace(/^\s*[-*]\s+/gm, "") // bullets
                    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
                    .replace(/\s{2,}/g, " ")
                    .trim();
            }

            function updateAudiobookSettingsLabel() {
                const lang = audiobookVoiceLocale || "es-ES";
                const speed = audiobookVoiceRate || 1.0;
                const tone = audiobookVoiceStyle || "neutral";
                showToast(`Voz: ${lang} · Tono: ${tone} · Velocidad: ${speed}x`);
            }

            function cycleAudiobookLocale() {
                const locales = ["es-ES", "es-MX", "en-US", "fr-FR", "pt-BR"];
                const idx = locales.indexOf(audiobookVoiceLocale);
                audiobookVoiceLocale = locales[(idx + 1) % locales.length];
                updateAudiobookSettingsLabel();
                if (audiobookQueue.length) restartAudiobookPlaybackFromCurrent();
            }

            function cycleAudiobookTone() {
                const tones = ["neutral", "calido", "serio", "energico", "suave"];
                const idx = tones.indexOf(audiobookVoiceStyle);
                audiobookVoiceStyle = tones[(idx + 1) % tones.length];
                updateAudiobookSettingsLabel();
                if (audiobookQueue.length) restartAudiobookPlaybackFromCurrent();
            }

            function cycleAudiobookSpeed() {
                const speeds = [0.8, 0.92, 1.0, 1.15, 1.3];
                const idx = speeds.indexOf(audiobookVoiceRate);
                audiobookVoiceRate = speeds[(idx + 1) % speeds.length];
                updateAudiobookSettingsLabel();
                if (audiobookQueue.length) restartAudiobookPlaybackFromCurrent();
            }

            function stopAudiobookPlayback() {
                window.speechSynthesis.cancel();
                currentAudiobookUtterance = null;
                isAudiobookPaused = false;
                audiobookQueue = [];
                audiobookIndex = 0;
                audiobookCurrentText = "";
                if (audiobookActiveButton) {
                    audiobookActiveButton.innerHTML = `<i class="fa-solid fa-play"></i> Reproducir`;
                }
            }

            function playAudiobookQueue() {
                if (!audiobookQueue.length || audiobookIndex >= audiobookQueue.length) {
                    stopAudiobookPlayback();
                    return;
                }
                const nextText = audiobookQueue[audiobookIndex];
                const utterance = buildUtterance(nextText);
                currentAudiobookUtterance = utterance;

                utterance.onstart = () => {
                    if (audiobookActiveButton) {
                        audiobookActiveButton.innerHTML = `<i class="fa-solid fa-pause"></i> Pausar`;
                    }
                };
                utterance.onend = () => {
                    if (isAudiobookPaused) return;
                    audiobookIndex += 1;
                    playAudiobookQueue();
                };
                utterance.onerror = () => {
                    stopAudiobookPlayback();
                };

                window.speechSynthesis.speak(utterance);
            }

            function restartAudiobookPlaybackFromCurrent() {
                if (!audiobookQueue.length && audiobookCurrentText) {
                    audiobookQueue = splitTextForSpeech(audiobookCurrentText);
                    audiobookIndex = Math.min(audiobookIndex, audiobookQueue.length - 1);
                }
                if (!audiobookQueue.length) return;
                window.speechSynthesis.cancel();
                isAudiobookPaused = false;
                playAudiobookQueue();
            }

            function toggleAudiobookPlayback(text, buttonEl) {
                if (!text || !text.trim()) {
                    showToast("No hay texto para reproducir.");
                    return;
                }
                const cleanText = stripSpeechFormatting(text);
                if (!cleanText) {
                    showToast("No hay texto válido para reproducir.");
                    return;
                }
                if (!("speechSynthesis" in window)) {
                    showToast("Tu navegador no soporta reproducción de voz.");
                    return;
                }

                audiobookActiveButton = buttonEl || audiobookActiveButton;
                audiobookCurrentText = cleanText;

                // Si está hablando, alternar pausa/reanudar
                if (window.speechSynthesis.speaking || isAudiobookPaused) {
                    if (window.speechSynthesis.paused || isAudiobookPaused) {
                        if (!window.speechSynthesis.speaking) {
                            restartAudiobookPlaybackFromCurrent();
                        } else {
                            window.speechSynthesis.resume();
                        }
                        isAudiobookPaused = false;
                        if (buttonEl) buttonEl.innerHTML = `<i class="fa-solid fa-pause"></i> Pausar`;
                    } else {
                        window.speechSynthesis.pause();
                        isAudiobookPaused = true;
                        if (buttonEl) buttonEl.innerHTML = `<i class="fa-solid fa-play"></i> Reanudar`;
                    }
                    return;
                }

                // Nueva reproducción (o reinicio)
                window.speechSynthesis.cancel();
                audiobookQueue = splitTextForSpeech(cleanText);
                audiobookIndex = 0;
                isAudiobookPaused = false;

                if (!window.speechSynthesis.getVoices().length) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        playAudiobookQueue();
                    };
                } else {
                    playAudiobookQueue();
                }
            }

            async function downloadAudiobookAudio(text, title, buttonEl) {
                if (!text || !text.trim()) {
                    showToast("No hay texto para convertir en audio.");
                    return;
                }
                const originalHtml = buttonEl ? buttonEl.innerHTML : "";
                if (buttonEl) {
                    buttonEl.disabled = true;
                    buttonEl.classList.add("opacity-70", "cursor-not-allowed");
                    buttonEl.innerHTML = `
                        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2
                                    5.291A7.962 7.962 0 014 12H0c0 3.042 1.135
                                    5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Generando WAV...</span>
                    `;
                }
                try {
                    const fileNameBase = (title || "audiolibro").replace(/[^\w\-]+/g, "_").slice(0, 60);
                    const { pcm, sampleRate } = await synthesizeAudiobookPcmLong(text, 210000, (current, total) => {
                        if (buttonEl) {
                            buttonEl.innerHTML = `
                                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2
                                            5.291A7.962 7.962 0 014 12H0c0 3.042 1.135
                                            5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Generando WAV (${current}/${total})...</span>
                            `;
                        }
                    });
                    const wavBuffer = pcmToWav(pcm, sampleRate, 1);
                    const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
                    const ext = "wav";
                    const url = URL.createObjectURL(audioBlob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${fileNameBase}.${ext}`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                } catch (e) {
                    showToast(`Error descargando audio: ${e.message || e}`);
                } finally {
                    if (buttonEl) {
                        buttonEl.disabled = false;
                        buttonEl.classList.remove("opacity-70", "cursor-not-allowed");
                        buttonEl.innerHTML = originalHtml;
                    }
                }
            }

            // -----------------------------------------------------------
            // FUNCIÓN AUXILIAR PARA GENERAR HASH DEL TEXTO
            // -----------------------------------------------------------
            async function generateTextHash(text) {
                // Hash simple para verificar si el texto cambió
                const encoder = new TextEncoder();
                const data = encoder.encode(text);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
            // -----------------------------------------------------------
            // 4. FIREBASE SAVE & LOAD
            // -----------------------------------------------------------

            let lastLocalSegmentsHash = null;

            function computeSegmentsHash(segments) {
                try {
                    return quickHash(JSON.stringify(segments || []));
                } catch {
                    return null;
                }
            }

            function applySegmentsToUI(nextSegments, options = {}) {
                const preserveRecording = !!options.preserveRecording;
                const recordingIds = new Set();

                if (preserveRecording) {
                    segmentsData.forEach(seg => {
                        if (seg && seg.status === "recording") {
                            recordingIds.add(String(seg.id));
                        }
                    });
                }

                const existingById = new Map(segmentsData.map(seg => [String(seg.id), seg]));

                const merged = (nextSegments || []).map(seg => {
                    const key = String(seg.id);
                    if (preserveRecording && recordingIds.has(key) && existingById.has(key)) {
                        return existingById.get(key);
                    }
                    return seg;
                });

                segmentsData = merged;

                const ids = new Set(segmentsData.map(seg => String(seg.id)));
                document.querySelectorAll("[id^='seg-']").forEach(el => {
                    const id = String(el.id || "").replace(/^seg-/, "");
                    if (!ids.has(id)) {
                        if (preserveRecording && recordingIds.has(id)) return;
                        el.remove();
                    }
                });

                if (!segmentsData.length) {
                    emptyState.classList.remove("hidden");
                    sessionFeed.appendChild(emptyState);
                    return;
                }

                emptyState.classList.add("hidden");
                segmentsData.forEach(seg => {
                    if (preserveRecording && recordingIds.has(String(seg.id))) return;
                    renderSegment(seg);
                });
            }

            async function saveSessionToFirebase() {
                if (!isFirebaseActive || !currentSessionId) return;

                const user = auth.currentUser;
                if (!user) {
                    return;
                }
                if (currentSessionOwnerId && currentSessionOwnerId !== user.uid) {
                    // No guardar si no es el propietario
                    return;
                }

                try {
                    const cleanSegments = segmentsData.map(seg => {
                        const clean = {};

                        for (const key in seg) {
                            const val = seg[key];

                            // ❌ NADA de undefined
                            if (val === undefined) continue;

                            // Recursión para objects
                            if (typeof val === "object" && val !== null) {
                                clean[key] = JSON.parse(JSON.stringify(val));
                            } else {
                                clean[key] = val;
                            }
                        }

                        return clean;
                    });

                    const segmentsJson = JSON.stringify(cleanSegments);
                    lastLocalSegmentsHash = quickHash(segmentsJson);
                    const segmentsBytes = new TextEncoder().encode(segmentsJson).length;

                    // Si el documento ya es muy grande, guardar solo en Storage/colección auxiliar
                    if (sessionTooLargeIds.has(currentSessionId) || segmentsBytes > 700_000) {
                        const { url, path } = await saveSegmentsToStorage(currentSessionId, segmentsJson);
                        await setDoc(doc(db, "audioTranslateSegments", currentSessionId), {
                            sessionId: currentSessionId,
                            segmentsUrl: url,
                            segmentsPath: path,
                            updatedAt: serverTimestamp(),
                            userId: user.uid
                        }, { merge: true });
                        return;
                    }

                    // 🔥 PRIMERO CREAR LA REFERENCIA
                    const sessionRef = doc(db, "audioTranslate", currentSessionId);
                    
                    // 🔥 LUEGO VERIFICAR QUE EL DOCUMENTO PERTENECE AL USUARIO ACTUAL
                    const docSnap = await getDoc(sessionRef);
                    if (docSnap.exists() && docSnap.data().userId && docSnap.data().userId !== user.uid) {
                        showToast("Error de permisos");
                        return;
                    }

                    // 🔥 ACTUALIZAR EL DOCUMENTO
                    await updateDoc(sessionRef, {
                        segments: cleanSegments,
                        lastUpdated: serverTimestamp(),
                        // Asegurar que userId esté presente (si es creación)
                        userId: user.uid
                    }, { merge: true }); // 🔥 IMPORTANTE: merge: true para no sobrescribir otros campos

                } catch (e) {
                    const msg = String(e?.message || e);
                    if (msg.includes("exceeds the maximum allowed size")) {
                        sessionTooLargeIds.add(currentSessionId);
                        try {
                            const segmentsJson = JSON.stringify(segmentsData);
                            const { url, path } = await saveSegmentsToStorage(currentSessionId, segmentsJson);
                            await setDoc(doc(db, "audioTranslateSegments", currentSessionId), {
                                sessionId: currentSessionId,
                                segmentsUrl: url,
                                segmentsPath: path,
                                updatedAt: serverTimestamp(),
                                userId: user.uid
                            }, { merge: true });
                            showToast("Sesión guardada en almacenamiento (tamaño grande).");
                        } catch (inner) {
                            showToast("Error guardando sesión. Ver consola.");
                        }
                    } else {
                        showToast("Error guardando sesión. Ver consola.");
                    }
                }
            }

            async function saveSegmentsToStorage(sessionId, segmentsJson) {
                if (!storage) throw new Error("Storage no inicializado.");
                const path = `sessions/${sessionId}/segments-${Date.now()}.json`;
                const ref = storageRef(storage, path);
                await uploadBytes(ref, new Blob([segmentsJson], { type: "application/json" }));
                const url = await getDownloadURL(ref);
                return { url, path };
            }


            function sanitizeAnalyses(seg) {
                if (!seg.analyses) return;

                for (const key in seg.analyses) {
                    if (seg.analyses[key] === undefined) {
                        delete seg.analyses[key];
                    }
                }
            }

            function loadSessionsList() {
                if (!isFirebaseActive) {
                    sessionList.innerHTML = `<div class="p-4 text-xs text-slate-500">
                        Firebase no configurado. Solo modo local.
                    </div>`;
                    return;
                }

                // 🔥 OBTENER USUARIO ACTUAL
                const user = auth.currentUser;
                if (!user) {
                    sessionList.innerHTML = `<div class="p-4 text-xs text-slate-500">
                        ${allowAnonymousAuth ? 'Iniciando sesión...' : 'Inicia sesión para ver sesiones sincronizadas.'}
                    </div>`;
                    if (allowAnonymousAuth) {
                        ensureAuthenticatedFirebaseUser().then((currentUser) => {
                            if (currentUser) {
                                loadSessionsList();
                                return;
                            }
                            sessionList.innerHTML = `<div class="p-4 text-xs text-red-500">
                                Error de autenticación. Algunas funciones estarán limitadas.
                            </div>`;
                        });
                    }
                    return;
                }

                const buildSessionItem = (docSnap, data) => {
                    const isActive = docSnap.id === currentSessionId;
                    const div = document.createElement('div');
                    div.className = `session-item ${isActive ? 'active' : ''}`;
                    div.dataset.id = docSnap.id;
                    const wrapper = document.createElement('div');
                    wrapper.className = 'flex items-center justify-between gap-2';

                    const left = document.createElement('div');
                    left.className = 'flex items-start gap-2 min-w-0';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = `session-select-checkbox rounded border-slate-300 mt-1 ${isSessionSelectionMode ? '' : 'hidden'}`;
                    checkbox.dataset.id = docSnap.id;
                    checkbox.checked = selectedSessionIds.has(docSnap.id);

                    const content = document.createElement('div');
                    content.className = 'min-w-0';

                    const title = document.createElement('div');
                    title.className = 'truncate title';
                    title.textContent = data.title || 'Sin título';

                    const date = document.createElement('div');
                    date.className = 'text-xs session-item-date';
                    date.textContent = data.createdAt
                        ? new Date(data.createdAt.seconds * 1000).toLocaleDateString()
                        : '';

                    content.appendChild(title);
                    content.appendChild(date);
                    left.appendChild(checkbox);
                    left.appendChild(content);

                    const menuButton = document.createElement('button');
                    menuButton.type = 'button';
                    menuButton.className = 'btn-session-menu text-slate-400 hover:text-slate-700 px-1 py-1 rounded transition-colors';
                    menuButton.dataset.id = docSnap.id;
                    menuButton.setAttribute('aria-label', `Opciones para ${data.title || 'Sin título'}`);
                    menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical text-sm"></i>';

                    const menu = document.createElement('div');
                    menu.className = 'menu-session hidden absolute right-2 top-9 bg-white border border-slate-200 rounded-md shadow-lg text-xs text-slate-700 w-40 py-1 z-20';

                    const buildMenuButton = (className, iconClass, label) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = className;
                        button.dataset.id = docSnap.id;
                        button.innerHTML = `
                            <i class="${escapeHtml(iconClass)} text-[11px]"></i>
                            <span>${escapeHtml(label)}</span>
                        `;
                        return button;
                    };

                    menu.appendChild(buildMenuButton(
                        'btn-rename-session w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100',
                        'fa-solid fa-pen',
                        'Renombrar sesión'
                    ));
                    menu.appendChild(buildMenuButton(
                        'btn-share-session w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 hover:text-indigo-700',
                        'fa-solid fa-share-nodes',
                        'Compartir sesión'
                    ));
                    menu.appendChild(buildMenuButton(
                        'btn-delete-session w-full flex items-center gap-2 px-3 py-2 hover:bg-red-600/10 hover:text-red-400',
                        'fa-solid fa-trash-can',
                        'Eliminar sesión'
                    ));

                    wrapper.appendChild(left);
                    wrapper.appendChild(menuButton);
                    div.appendChild(wrapper);
                    div.appendChild(menu);

                    div.addEventListener('click', (e) => {
                        if (e.target.closest('.btn-session-menu') || 
                            e.target.closest('.menu-session') ||
                            e.target.closest('.session-select-checkbox')) {
                            return;
                        }
                        document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
                        div.classList.add('active');
                        currentSessionId = docSnap.id;
                        loadSession(docSnap.id, data);
                    });

                    return div;
                };

                const renderSessions = (ownedMap, sharedEmailMap, sharedUidMap) => {
                    sessionList.innerHTML = '';
                    const unique = new Map();
                    ownedMap.forEach((value, key) => {
                        unique.set(key, value);
                    });
                    sharedEmailMap.forEach((value, key) => {
                        if (!unique.has(key)) unique.set(key, value);
                    });
                    sharedUidMap.forEach((value, key) => {
                        if (!unique.has(key)) unique.set(key, value);
                    });
                    const allDocs = Array.from(unique.values());

                    if (!allDocs.length) {
                        sessionList.innerHTML = `
                            <div class="p-4 text-center text-sm text-slate-500">
                                <i class="fa-solid fa-microphone-slash mb-2 text-lg"></i>
                                <p>No hay sesiones guardadas</p>
                                <p class="text-xs mt-1">Crea tu primera sesión con el botón "Nueva sesión"</p>
                            </div>
                        `;
                        return;
                    }

                    allDocs.sort((a, b) => {
                        const aTime = a.data.createdAt?.seconds ? a.data.createdAt.seconds : 0;
                        const bTime = b.data.createdAt?.seconds ? b.data.createdAt.seconds : 0;
                        return bTime - aTime;
                    });

                    sessionsIndex = allDocs.map(({ docSnap, data }) => ({
                        id: docSnap.id,
                        title: data.title || "Sin título",
                        createdAt: data.createdAt || null,
                        userId: data.userId || null
                    }));

                    allDocs.forEach(({ docSnap, data }) => {
                        sessionList.appendChild(buildSessionItem(docSnap, data));
                    });
                    updateSelectedSessionsUI();
                };

                const ownedMap = new Map();
                const sharedEmailMap = new Map();
                const sharedUidMap = new Map();

                const qOwned = query(
                    collection(db, "audioTranslate"),
                    where("userId", "==", user.uid),
                    orderBy("createdAt", "desc")
                );

                onSnapshot(qOwned, (snapshot) => {
                    ownedMap.clear();
                    snapshot.forEach(docSnap => {
                        ownedMap.set(docSnap.id, { docSnap, data: docSnap.data() });
                    });
                    renderSessions(ownedMap, sharedEmailMap, sharedUidMap);
                }, (error) => {
                    sessionList.innerHTML = `<div class="p-4 text-xs text-red-500">
                        Error cargando sesiones: ${error.message}
                    </div>`;
                });

                if (user.email) {
                    const email = user.email.toLowerCase();
                    const qShared = query(
                        collection(db, "audioTranslate"),
                        where("sharedWith", "array-contains", email)
                    );
                    onSnapshot(qShared, (snapshot) => {
                        sharedEmailMap.clear();
                        snapshot.forEach(docSnap => {
                            sharedEmailMap.set(docSnap.id, { docSnap, data: docSnap.data() });
                        });
                        renderSessions(ownedMap, sharedEmailMap, sharedUidMap);
                    }, (error) => {
                    });
                }

                if (user.uid) {
                    const qSharedUid = query(
                        collection(db, "audioTranslate"),
                        where("sharedWithUids", "array-contains", user.uid)
                    );
                    onSnapshot(qSharedUid, (snapshot) => {
                        sharedUidMap.clear();
                        snapshot.forEach(docSnap => {
                            sharedUidMap.set(docSnap.id, { docSnap, data: docSnap.data() });
                        });
                        renderSessions(ownedMap, sharedEmailMap, sharedUidMap);
                    }, (error) => {
                    });
                }
            }




            // --- Menú contextual de sesiones (3 puntos) ---
            async function promptRenameSession(currentTitle = "") {
                return new Promise((resolve) => {
                    const overlay = document.createElement("div");
                    overlay.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[1200]";
                    overlay.innerHTML = `
                        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-200">
                                <h3 class="text-sm font-semibold text-slate-800">Renombrar sesión</h3>
                            </div>
                            <div class="p-4 space-y-3">
                                <label for="renameSessionInput" class="text-xs text-slate-500">Nuevo nombre</label>
                                <input id="renameSessionInput" type="text" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" maxlength="120" placeholder="Escribe el nombre de la sesión"/>
                            </div>
                            <div class="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
                                <button id="renameCancelBtn" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
                                <button id="renameOkBtn" class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Guardar</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);

                    const input = overlay.querySelector("#renameSessionInput");
                    const cancelBtn = overlay.querySelector("#renameCancelBtn");
                    const okBtn = overlay.querySelector("#renameOkBtn");
                    if (input) input.value = (currentTitle || "").trim();

                    const cleanup = (value) => {
                        overlay.remove();
                        resolve(value);
                    };

                    cancelBtn?.addEventListener("click", () => cleanup(null));
                    overlay.addEventListener("click", (e) => {
                        if (e.target === overlay) cleanup(null);
                    });
                    okBtn?.addEventListener("click", () => cleanup(input?.value ?? ""));
                    input?.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            cleanup(input.value ?? "");
                        }
                        if (e.key === "Escape") {
                            e.preventDefault();
                            cleanup(null);
                        }
                    });

                    setTimeout(() => {
                        input?.focus();
                        input?.select();
                    }, 0);
                });
            }

            async function promptShareEmail() {
                return new Promise((resolve) => {
                    const overlay = document.createElement("div");
                    overlay.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[1200]";
                    overlay.innerHTML = `
                        <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-200">
                                <h3 class="text-sm font-semibold text-slate-800">Compartir sesión</h3>
                            </div>
                            <div class="p-4 space-y-3">
                                <label class="text-xs text-slate-500">Correo del usuario</label>
                                <input id="shareEmailInput" type="email" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="correo@dominio.com"/>
                                <div class="text-xs text-slate-500 mt-2">Tipo de compartir</div>
                                <div class="flex items-center gap-3 text-xs">
                                    <label class="flex items-center gap-2">
                                        <input type="radio" name="shareMode" value="live" checked>
                                        <span>En vivo</span>
                                    </label>
                                    <label class="flex items-center gap-2">
                                        <input type="radio" name="shareMode" value="copy">
                                        <span>Copia</span>
                                    </label>
                                </div>
                                <div>
                                    <div class="text-xs text-slate-500 mb-2">Usuarios</div>
                                    <div id="shareUsersList" class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        <div class="p-3 text-xs text-slate-400">Cargando usuarios...</div>
                                    </div>
                                </div>
                            </div>
                            <div class="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
                                <button id="shareCancelBtn" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
                                <button id="shareOkBtn" class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Compartir</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);

                    const input = overlay.querySelector("#shareEmailInput");
                    const cancelBtn = overlay.querySelector("#shareCancelBtn");
                    const okBtn = overlay.querySelector("#shareOkBtn");
                    const usersList = overlay.querySelector("#shareUsersList");
                    const modeInputs = overlay.querySelectorAll("input[name='shareMode']");

                    const cleanup = (value) => {
                        overlay.remove();
                        resolve(value);
                    };

                    cancelBtn.addEventListener("click", () => cleanup(null));
                    overlay.addEventListener("click", (e) => {
                        if (e.target === overlay) cleanup(null);
                    });
                    okBtn.addEventListener("click", () => {
                        const selectedMode = Array.from(modeInputs).find(i => i.checked)?.value || "live";
                        cleanup({
                            email: input.value,
                            uid: input.dataset.uid || "",
                            mode: selectedMode
                        });
                    });
                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            const selectedMode = Array.from(modeInputs).find(i => i.checked)?.value || "live";
                            cleanup({
                                email: input.value,
                                uid: input.dataset.uid || "",
                                mode: selectedMode
                            });
                        }
                    });
                    input.addEventListener("input", () => {
                        input.dataset.uid = "";
                    });

                    setTimeout(() => input.focus(), 0);

                    (async () => {
                        try {
                            const snap = await getDocs(collection(db, "users"));
                            const currentEmail = auth?.currentUser?.email ? auth.currentUser.email.toLowerCase() : null;
                            const users = [];

                            snap.forEach(docSnap => {
                                const data = docSnap.data() || {};
                                const email = (data.email || "").toLowerCase();
                                if (!email) return;
                                if (currentEmail && email === currentEmail) return;
                                users.push({ email, name: data.name || data.displayName || email, uid: docSnap.id });
                            });

                            if (!users.length) {
                                usersList.innerHTML = `<div class="p-3 text-xs text-slate-400">No hay usuarios disponibles.</div>`;
                                return;
                            }

                            users.sort((a, b) => a.email.localeCompare(b.email));
                            usersList.innerHTML = "";
                            users.forEach((u) => {
                                const btn = document.createElement("button");
                                btn.type = "button";
                                btn.className = "w-full text-left px-3 py-2 text-xs hover:bg-slate-50";
                                btn.dataset.email = u.email;
                                btn.dataset.uid = u.uid;

                                const nameDiv = document.createElement("div");
                                nameDiv.className = "font-medium text-slate-700";
                                nameDiv.textContent = u.name;

                                const emailDiv = document.createElement("div");
                                emailDiv.className = "text-slate-400";
                                emailDiv.textContent = u.email;

                                btn.appendChild(nameDiv);
                                btn.appendChild(emailDiv);
                                btn.addEventListener("click", () => {
                                    input.value = btn.dataset.email || "";
                                    input.dataset.uid = btn.dataset.uid || "";
                                    input.focus();
                                });
                                usersList.appendChild(btn);
                            });
                        } catch (err) {
                            usersList.innerHTML = `<div class="p-3 text-xs text-red-500">No se pudieron cargar usuarios.</div>`;
                        }
                    })();
                });
            }

            function setSessionSelectionMode(enabled) {
                isSessionSelectionMode = !!enabled;

                if (multiSessionActions) {
                    multiSessionActions.classList.toggle('hidden', !isSessionSelectionMode);
                }

                document.querySelectorAll('.session-select-checkbox').forEach(cb => {
                    cb.classList.toggle('hidden', !isSessionSelectionMode);
                });

                if (btnToggleSessionSelectionMode) {
                    btnToggleSessionSelectionMode.classList.toggle('is-active', isSessionSelectionMode);
                    const selectionLabel = isSessionSelectionMode
                        ? 'Ocultar selección de sesiones'
                        : 'Seleccionar sesiones';
                    btnToggleSessionSelectionMode.setAttribute('aria-label', selectionLabel);
                    btnToggleSessionSelectionMode.setAttribute('title', selectionLabel);
                }

                if (btnToggleSessionSelectionModeIcon) {
                    btnToggleSessionSelectionModeIcon.classList.toggle('fa-check-double', !isSessionSelectionMode);
                    btnToggleSessionSelectionModeIcon.classList.toggle('fa-list-check', isSessionSelectionMode);
                }

                if (!isSessionSelectionMode) {
                    selectedSessionIds.clear();
                    if (selectAllSessions) {
                        selectAllSessions.checked = false;
                        selectAllSessions.indeterminate = false;
                    }
                    document.querySelectorAll('.session-select-checkbox').forEach(cb => {
                        cb.checked = false;
                    });
                }

                updateSelectedSessionsUI();
            }

            if (btnToggleSessionSelectionMode) {
                btnToggleSessionSelectionMode.addEventListener('click', () => {
                    setSessionSelectionMode(!isSessionSelectionMode);
                });
                setSessionSelectionMode(false);
            }

            sessionList.addEventListener('click', async (e) => {
                const menuBtn   = e.target.closest('.btn-session-menu');
                const deleteBtn = e.target.closest('.btn-delete-session');
                const renameBtn = e.target.closest('.btn-rename-session');
                const shareBtn  = e.target.closest('.btn-share-session');


                // Abrir/cerrar menú
                if (menuBtn) {
                    e.stopPropagation();
                    const container = menuBtn.closest('.session-item');
                    const menu = container.querySelector('.menu-session');

                    // Cerrar otros menús
                    document.querySelectorAll('.menu-session').forEach(m => {
                        if (m !== menu) m.classList.add('hidden');
                        m.closest('.session-item')?.classList.remove('menu-open');
                    });

                    menu.classList.toggle('hidden');
                    container.classList.toggle('menu-open', !menu.classList.contains('hidden'));
                    return;
                }


                // ✏️ Renombrar sesión
                if (renameBtn) {
                    e.stopPropagation();
                    const sessionId = renameBtn.dataset.id;
                    const currentTitle = sessionsIndex.find(s => s.id === sessionId)?.title
                        || renameBtn.closest('.session-item')?.querySelector('.title')?.textContent
                        || "";
                    const nuevo = await promptRenameSession(currentTitle);
                    if (nuevo === null) return;
                    const cleanName = nuevo.trim();
                    if (!cleanName) {
                        showToast("El nombre no puede estar vacío.");
                        return;
                    }
                    renameSession(sessionId, cleanName);
                    return;
                }

                // Compartir sesión
                if (shareBtn) {
                    e.stopPropagation();
                    const sessionId = shareBtn.dataset.id;
                    const shareData = await promptShareEmail();
                    if (!shareData || !shareData.email || !shareData.email.trim()) return;
                    const cleanEmail = shareData.email.trim().toLowerCase();
                    if (!cleanEmail.includes("@")) {
                        showToast("Ingresa un correo válido.");
                        return;
                    }

                    if (!isFirebaseActive) {
                        showToast("Firebase no está activo.");
                        return;
                    }

                    try {
                        const sessionRef = doc(db, "audioTranslate", sessionId);
                        const sessionSnap = await getDoc(sessionRef);
                        if (!sessionSnap.exists()) {
                            showToast("Sesión no encontrada.");
                            return;
                        }

                        const sessionData = sessionSnap.data();
                        const isOwner = auth?.currentUser?.uid && sessionData.userId === auth.currentUser.uid;
                        if (!isOwner) {
                            showToast("Solo el propietario puede compartir.");
                            return;
                        }

                        const mode = shareData.mode || "live";
                        if (mode === "copy") {
                            if (!shareData.uid) {
                                showToast("Selecciona un usuario con cuenta para copiar.");
                                return;
                            }
                            const newDoc = await addDoc(collection(db, "audioTranslate"), {
                                createdAt: serverTimestamp(),
                                title: `${sessionData.title || "Sesión"} (copia)`,
                                segments: sessionData.segments || [],
                                chatIA: sessionData.chatIA || [],
                                modelUsed: sessionData.modelUsed || selectGeminiEndpoint.value,
                                config: sessionData.config || {},
                                userId: shareData.uid,
                                userEmail: cleanEmail
                            });
                            showToast("Copia compartida.");
                        } else {
                            const payload = {
                                sharedWith: arrayUnion(cleanEmail),
                                lastUpdated: serverTimestamp()
                            };
                            if (shareData.uid) {
                                payload.sharedWithUids = arrayUnion(shareData.uid);
                            }
                            await updateDoc(sessionRef, payload);
                            showToast("Sesión compartida en vivo.");
                        }
                    } catch (err) {
                        showToast("No se pudo compartir la sesión.");
                    }
                    return;
                }



                // Eliminar sesión
                if (deleteBtn) {
                    e.stopPropagation();
                    const sessionId = deleteBtn.dataset.id;
                    if (confirm('¿Eliminar esta sesión y todos sus segmentos? Esta acción no se puede deshacer.')) {
                        deleteSession(sessionId);
                    }
                    return;
                }
            });

            document.addEventListener('click', (e) => {
                if (e.target.closest('.btn-session-menu') || e.target.closest('.menu-session')) return;
                document.querySelectorAll('.menu-session').forEach(m => m.classList.add('hidden'));
                document.querySelectorAll('.session-item.menu-open').forEach(el => el.classList.remove('menu-open'));
            });

            if (sessionList) {
                sessionList.addEventListener('change', (e) => {
                    const checkbox = e.target.closest('.session-select-checkbox');
                    if (!checkbox) return;
                    const id = checkbox.dataset.id;
                    if (!id) return;
                    if (checkbox.checked) selectedSessionIds.add(id);
                    else selectedSessionIds.delete(id);
                    updateSelectedSessionsUI();
                });
            }

            if (selectAllSessions) {
                selectAllSessions.addEventListener('change', () => {
                    const ids = Array.from(document.querySelectorAll('.session-item'))
                        .map(el => el.dataset.id)
                        .filter(Boolean);
                    if (selectAllSessions.checked) {
                        ids.forEach(id => selectedSessionIds.add(id));
                    } else {
                        ids.forEach(id => selectedSessionIds.delete(id));
                    }
                    document.querySelectorAll('.session-select-checkbox').forEach(cb => {
                        cb.checked = selectedSessionIds.has(cb.dataset.id);
                    });
                    updateSelectedSessionsUI();
                });
            }

            function normalizeSegments(raw) {
                if (!raw) return [];
                if (Array.isArray(raw)) return raw;
                if (typeof raw === "string") {
                    let parsed = null;
                    try {
                        parsed = JSON.parse(raw);
                    } catch {
                        parsed = null;
                    }
                    if (typeof parsed === "string") {
                        try {
                            parsed = JSON.parse(parsed);
                        } catch {
                            parsed = null;
                        }
                    }
                    return normalizeSegments(parsed);
                }
                if (typeof raw === "object") {
                    return Object.values(raw);
                }
                return [];
            }

            async function fetchSegmentsTextFromRemote(segData, sessionId) {
                if (!segData) return null;

                const url = typeof segData.segmentsUrl === "string" ? segData.segmentsUrl : null;
                const path = typeof segData.segmentsPath === "string" ? segData.segmentsPath : null;

                if (url) {
                    try {
                        const res = await fetch(url, { cache: "no-store" });
                        if (res.ok) {
                            return await res.text();
                        }
                    } catch (err) {
                        // Fallback to Storage SDK below.
                    }
                }

                if (!storage) throw new Error("Storage no inicializado.");

                const candidate = path || url;
                if (!candidate) return null;

                const ref = storageRef(storage, candidate);
                const freshUrl = await getDownloadURL(ref);
                const res = await fetch(freshUrl, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();

                if (sessionId && isFirebaseActive) {
                    try {
                        await setDoc(doc(db, "audioTranslateSegments", sessionId), {
                            segmentsUrl: freshUrl,
                            segmentsPath: ref.fullPath || path || null
                        }, { merge: true });
                    } catch (err) {
                    }
                }

                return text;
            }

            async function loadSegmentsFromStorage(sessionId) {
                if (!isFirebaseActive) return [];
                try {
                    const segDoc = await getDoc(doc(db, "audioTranslateSegments", sessionId));
                    if (!segDoc.exists()) return [];
                    const segData = segDoc.data();
                    const text = await fetchSegmentsTextFromRemote(segData, sessionId);
                    if (!text) return [];
                    return normalizeSegments(text);
                } catch (err) {
                    return [];
                }
            }

            function extractSegmentsFromSessionDoc(data) {
                if (!data || typeof data !== "object") return [];
                const keys = Object.keys(data);
                const numericKeys = keys.filter(k => /^\d+$/.test(k));
                if (numericKeys.length) {
                    return numericKeys
                        .map(k => data[k])
                        .filter(v => v && typeof v === "object");
                }
                return [];
            }

            function repairSegmentsLocal(inputSegments) {
                const segments = Array.isArray(inputSegments) ? inputSegments : [];
                let changed = false;
                let maxId = 0;
                const pendingToneIdsByTone = new Map();

                for (const seg of segments) {
                    if (seg && typeof seg.id === "number" && Number.isFinite(seg.id)) {
                        if (seg.id > maxId) maxId = seg.id;
                    }
                }

                const repaired = segments.map(seg => {
                    const clean = seg && typeof seg === "object" ? { ...seg } : {};

                    if (!clean.id || typeof clean.id !== "number") {
                        maxId += 1;
                        clean.id = maxId;
                        changed = true;
                    }

                    if (!clean.raw && clean.original_raw) {
                        clean.raw = clean.original_raw;
                        changed = true;
                    }
                    if (clean.raw && !clean.original_raw) {
                        clean.original_raw = clean.raw;
                        changed = true;
                    }
                    if (!clean.status) {
                        clean.status = clean.raw ? "done" : "stopped";
                        changed = true;
                    }
                    if (clean.analyses && typeof clean.analyses !== "object") {
                        clean.analyses = {};
                        changed = true;
                    }
                    if (clean.analisis_voces && typeof clean.analisis_voces !== "object") {
                        clean.analisis_voces = { transcripcion_estructurada: [] };
                        changed = true;
                    }
                    if (clean.analisis_voces && !Array.isArray(clean.analisis_voces.transcripcion_estructurada)) {
                        clean.analisis_voces.transcripcion_estructurada = [];
                        changed = true;
                    }

                    if (clean.status === "processing") {
                        const tone = clean.generatingTone;
                        if (tone && clean.analyses?.[tone]) {
                            clean.status = "done";
                            delete clean.generatingTone;
                            changed = true;
                        } else if (!tone) {
                            clean.status = clean.raw ? "done" : "stopped";
                            changed = true;
                        } else if (!clean.raw) {
                            clean.status = "error";
                            clean.error = clean.error || "No hay texto base para procesar";
                            delete clean.generatingTone;
                            changed = true;
                        } else {
                            clean.status = "done";
                            delete clean.generatingTone;
                            if (!pendingToneIdsByTone.has(tone)) {
                                pendingToneIdsByTone.set(tone, []);
                            }
                            pendingToneIdsByTone.get(tone).push(clean.id);
                            changed = true;
                        }
                    }

                    if (clean.timerInterval !== null) {
                        clean.timerInterval = null;
                        changed = true;
                    }

                    return clean;
                });

                return { segments: repaired, changed, pendingToneIdsByTone };
            }

            async function repairCurrentSession() {
                if (!isFirebaseActive) {
                    showToast("No se puede reparar: Firebase no está activo.");
                    return;
                }
                if (!currentSessionId) {
                    showToast("No hay sesión activa para reparar.");
                    return;
                }
                const user = auth.currentUser;
                if (!user) {
                    showToast("Debes iniciar sesión para reparar.");
                    return;
                }
                if (currentSessionOwnerId && currentSessionOwnerId !== user.uid) {
                    showToast("Solo el propietario puede reparar esta sesión.");
                    return;
                }

                try {
                    const sessionRef = doc(db, "audioTranslate", currentSessionId);
                    const snap = await getDoc(sessionRef);
                    if (!snap.exists()) {
                        showToast("Sesión no encontrada.");
                        return;
                    }
                    const data = snap.data() || {};

                    let segments = normalizeSegments(data.segments);
                    if (!segments.length) {
                        const fromRoot = extractSegmentsFromSessionDoc(data);
                        if (fromRoot.length) {
                            segments = fromRoot;
                        } else {
                            const fallback = await loadSegmentsFromStorage(currentSessionId);
                            if (fallback.length) {
                                segments = fallback;
                            }
                        }
                    }

                    if (!segments.length) {
                        showToast("No se encontraron segmentos para reparar.");
                        return;
                    }

                    const { segments: repaired, changed, pendingToneIdsByTone } = repairSegmentsLocal(segments);
                    segmentsData = repaired;

                    sessionFeed.innerHTML = "";
                    if (!segmentsData.length) {
                        emptyState.classList.remove("hidden");
                        sessionFeed.appendChild(emptyState);
                    } else {
                        emptyState.classList.add("hidden");
                        segmentsData.forEach(renderSegment);
                        setTimeout(() => sessionFeed.scrollTop = sessionFeed.scrollHeight, 100);
                    }

                    if (changed) {
                        await saveSessionToFirebase();
                    }

                    if (pendingToneIdsByTone.size) {
                        pendingToneIdsByTone.forEach((ids, tone) => {
                            if (ids.length) enqueueToneGeneration(ids, tone);
                        });
                    }

                    showToast(changed ? "✅ Sesión reparada y guardada" : "✅ Sesión ya estaba limpia");
                } catch (err) {
                    showToast("❌ Error al reparar la sesión");
                }
            }


            function getTimestampSeconds(ts) {
                if (!ts) return 0;
                if (typeof ts.seconds === "number") return ts.seconds;
                if (typeof ts._seconds === "number") return ts._seconds;
                return 0;
            }

            function unsubscribeSessionListeners() {
                if (sessionUnsubscribe) {
                    sessionUnsubscribe();
                    sessionUnsubscribe = null;
                }
                if (sessionSegmentsUnsubscribe) {
                    sessionSegmentsUnsubscribe();
                    sessionSegmentsUnsubscribe = null;
                }
                if (sessionContextNotesUnsubscribe) {
                    sessionContextNotesUnsubscribe();
                    sessionContextNotesUnsubscribe = null;
                }
                lastRemoteUpdate = 0;
                lastRemoteSegmentsUpdate = 0;
                lastRemoteContextNotesUpdate = 0;
                lastRemoteTone = null;
            }

            function subscribeToSession(sessionId) {
                if (!isFirebaseActive || !sessionId) return;
                unsubscribeSessionListeners();

                sessionUnsubscribe = onSnapshot(doc(db, "audioTranslate", sessionId), async (snap) => {
                    if (!snap.exists()) return;
                    if (sessionId !== currentSessionId) return;

                    const data = snap.data() || {};
                    currentSessionOwnerId = data.userId || currentSessionOwnerId;

                    const updatedAt = getTimestampSeconds(data.lastUpdated);
                    const hasNewUpdate = updatedAt && updatedAt > lastRemoteUpdate;

                    if (hasNewUpdate) {
                        lastRemoteUpdate = updatedAt;
                        let segments = normalizeSegments(data.segments);
                        if (segments.length) {
                            const repaired = repairSegmentsLocal(segments);
                            const incomingHash = computeSegmentsHash(repaired.segments);
                            const sameAsLocal = incomingHash && incomingHash === lastLocalSegmentsHash;
                            if (!sameAsLocal) {
                                applySegmentsToUI(repaired.segments, { preserveRecording: isRecording });
                                if (incomingHash) lastLocalSegmentsHash = incomingHash;
                            }
                        }
                    }

                    if (data.lastTone && data.lastTone !== lastRemoteTone) {
                        lastRemoteTone = data.lastTone;
                        localStorage.setItem("lastTone", data.lastTone);
                        if (selectAction) selectAction.value = data.lastTone;

                        const user = auth.currentUser;
                        const isOwner = user && currentSessionOwnerId === user.uid;
                        if (isOwner) {
                            await applyToneToAllBlocks(data.lastTone, { fromRemote: true });
                        }
                    }
                });

                sessionSegmentsUnsubscribe = onSnapshot(doc(db, "audioTranslateSegments", sessionId), async (snap) => {
                    if (!snap.exists()) return;
                    if (sessionId !== currentSessionId) return;
                    const data = snap.data() || {};
                    const updatedAt = getTimestampSeconds(data.updatedAt);
                    if (!updatedAt || updatedAt <= lastRemoteSegmentsUpdate) return;
                    lastRemoteSegmentsUpdate = updatedAt;
                    try {
                        const text = await fetchSegmentsTextFromRemote(data, sessionId);
                        if (!text) return;
                        const segments = normalizeSegments(text);
                        if (segments.length) {
                            const repaired = repairSegmentsLocal(segments);
                            const incomingHash = computeSegmentsHash(repaired.segments);
                            const sameAsLocal = incomingHash && incomingHash === lastLocalSegmentsHash;
                            if (!sameAsLocal) {
                                applySegmentsToUI(repaired.segments, { preserveRecording: isRecording });
                                if (incomingHash) lastLocalSegmentsHash = incomingHash;
                            }
                        }
                    } catch (err) {
                    }
                });

                sessionContextNotesUnsubscribe = onSnapshot(doc(db, "audioTranslateContextNotes", sessionId), (snap) => {
                    if (!snap.exists()) {
                        if (sessionId !== currentSessionId) return;
                        blockContextNotes = {};
                        contextNotesCache.set(sessionId, { notes: {}, updatedAt: 0 });
                        rerenderSegmentsForContextNotes();
                        return;
                    }
                    if (sessionId !== currentSessionId) return;
                    const data = snap.data() || {};
                    const updatedAt = getTimestampSeconds(data.updatedAt);
                    if (updatedAt && updatedAt <= lastRemoteContextNotesUpdate) return;
                    lastRemoteContextNotesUpdate = updatedAt || Date.now();
                    const normalized = normalizeContextNotesMap(data.notes);
                    blockContextNotes = normalized;
                    contextNotesCache.set(sessionId, { notes: { ...normalized }, updatedAt: lastRemoteContextNotesUpdate });
                    rerenderSegmentsForContextNotes();
                });
            }

            async function loadSession(id, data) {
                // 🔥 VERIFICAR QUE EL USUARIO ACTUAL ES EL PROPIETARIO
                const user = auth.currentUser;
                const userEmail = user?.email ? user.email.toLowerCase() : null;
                const userUid = user?.uid || null;
                const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith.map(e => String(e).toLowerCase()) : [];
                const sharedWithUids = Array.isArray(data.sharedWithUids) ? data.sharedWithUids.map(String) : [];
                const isOwner = user && data.userId && data.userId === user.uid;
                const isShared = (userEmail && sharedWith.includes(userEmail)) || (userUid && sharedWithUids.includes(userUid));

                if (user && data.userId && !isOwner && !isShared) {
                    showToast("⛔ No tienes permiso para acceder a esta sesión");
                    return;
                }

                if (isRecording) {
                    if (!confirm("Estás grabando. ¿Deseas detener y cambiar de sesión?")) return;
                    stopContinuousRecording();
                }

                sessionRevision += 1;
                currentSessionId = id;
                currentSessionOwnerId = data.userId || null;
                localStorage.setItem("lastSessionId", id);

                subscribeToSession(id);

                let segments = normalizeSegments(data.segments);
                if (!segments.length) {
                    const fromRoot = extractSegmentsFromSessionDoc(data);
                    if (fromRoot.length) {
                        segments = fromRoot;
                    } else {
                        const fallback = await loadSegmentsFromStorage(id);
                        if (fallback.length) {
                            segments = fallback;
                        }
                    }
                }

                segments.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                segmentsData = segments;
                let repairedSegments = false;
                const pendingToneIdsByTone = new Map();
                segmentsData.forEach(seg => {
                    if (!seg.raw && seg.original_raw) {
                        seg.raw = seg.original_raw;
                        repairedSegments = true;
                    }
                    if (seg.raw && !seg.original_raw) {
                        seg.original_raw = seg.raw;
                        repairedSegments = true;
                    }
                    if (!seg.status) {
                        seg.status = seg.raw ? "done" : "stopped";
                        repairedSegments = true;
                    }
                    if (seg.analyses && typeof seg.analyses !== "object") {
                        seg.analyses = {};
                        repairedSegments = true;
                    }
                    if (seg.generatingTone && seg.analyses?.[seg.generatingTone]) {
                        seg.status = "done";
                        delete seg.generatingTone;
                        repairedSegments = true;
                    }
                });

                // 🔧 Normalizar bloques "procesando" para evitar sesiones trabadas
                segmentsData.forEach(seg => {
                    if (seg.status === "processing") {
                        const tone = seg.generatingTone;
                        if (tone && seg.analyses?.[tone]) {
                            seg.status = "done";
                            delete seg.generatingTone;
                            repairedSegments = true;
                        } else if (!tone) {
                            seg.status = seg.raw ? "done" : "stopped";
                            repairedSegments = true;
                        } else if (!seg.raw) {
                            seg.status = "error";
                            seg.error = "No hay texto base para procesar";
                            delete seg.generatingTone;
                            repairedSegments = true;
                        } else {
                            // Si estaba procesando tono pero quedó colgado, re-enviar a la cola
                            seg.status = "done";
                            delete seg.generatingTone;
                            if (!pendingToneIdsByTone.has(tone)) {
                                pendingToneIdsByTone.set(tone, []);
                            }
                            pendingToneIdsByTone.get(tone).push(seg.id);
                            repairedSegments = true;
                        }
                    }
                });

                await loadContextNotesForSession(id);

                // Restaurar estado de colapso desde localStorage
                const collapsedSet = loadCollapsedState(id);
                segmentsData.forEach(seg => {
                    if (collapsedSet.has(Number(seg.id))) {
                        seg.collapsed = true;
                    }
                });

                // Restaurar tonos desde localStorage
                const toneCache = loadToneCache(id);
                segmentsData.forEach(seg => {
                    if (!seg.raw) return;
                    const cacheEntry = toneCache[String(seg.id)];
                    if (!cacheEntry) return;
                    if (cacheEntry.rawHash !== quickHash(seg.raw)) return;
                    seg.analyses = seg.analyses || {};
                    const expectedContextHash = getToneContextHashForSegment(seg);
                    const toneContextHashes = (cacheEntry.toneContextHashes && typeof cacheEntry.toneContextHashes === "object")
                        ? cacheEntry.toneContextHashes
                        : {};
                    const fallbackContextHash = typeof cacheEntry.noteHash === "string" ? cacheEntry.noteHash : "";
                    for (const toneKey in cacheEntry.analyses || {}) {
                        const toneText = cacheEntry.analyses[toneKey];
                        if (typeof toneText !== "string" || !toneText.trim()) continue;
                        const cachedToneContextHash = typeof toneContextHashes[toneKey] === "string"
                            ? toneContextHashes[toneKey]
                            : fallbackContextHash;
                        const hasContextNote = !!getToneContextTextForSegment(seg);
                        const isCompatible = cachedToneContextHash
                            ? (cachedToneContextHash === expectedContextHash)
                            : !hasContextNote;
                        if (!isCompatible) continue;
                        seg.analyses[toneKey] = toneText;
                        setToneContextHashForSegment(seg, toneKey, cachedToneContextHash || expectedContextHash);
                    }
                    if (cacheEntry.currentTone && isToneAnalysisValidForCurrentContext(seg, cacheEntry.currentTone)) {
                        seg.currentTone = cacheEntry.currentTone;
                    }
                });

                // Si el cache local ya tiene tonos listos, no re-encolar
                if (pendingToneIdsByTone.size) {
                    pendingToneIdsByTone.forEach((ids, tone) => {
                        const filtered = ids.filter((idVal) => {
                            const seg = segmentsData.find(s => String(s.id) === String(idVal));
                            return !(seg && isToneAnalysisValidForCurrentContext(seg, tone));
                        });
                        if (filtered.length) {
                            pendingToneIdsByTone.set(tone, filtered);
                        } else {
                            pendingToneIdsByTone.delete(tone);
                        }
                    });
                }

                fixInvalidSegmentIds();

                // 🔧 Normalizar bloques "grabando" si no hay grabación activa
                if (!isRecording) {
                    segmentsData.forEach(seg => {
                        if (seg.timerInterval) {
                            clearInterval(seg.timerInterval);
                            seg.timerInterval = null;
                        }
                        if (seg.audioWaveInterval) {
                            clearInterval(seg.audioWaveInterval);
                            seg.audioWaveInterval = null;
                        }
                        if (seg.status === "recording") {
                            seg.status = "stopped";
                            seg.error = "Grabación interrumpida";
                        }
                    });
                    updateUIState(false);
                    updateStatus("Listo");
                }

                currentSessionTitle.textContent = data.title || "Sesión sin título";
                
                // 🔥 Restaurar configuración de duración de bloque
                if (data.config?.blockMinutes) {
                    const min = parseInt(data.config.blockMinutes);
                    if (!isNaN(min) && min >= 1) {
                        CHUNK_DURATION_MS = min * 60000;
                        inputBlockMinutes.value = min;
                    }
                }
                if (data.config?.micGainValue !== undefined && data.config?.micGainValue !== null) {
                    const configuredGain = clampMicGain(parseFloat(data.config.micGainValue));
                    micGainValue = configuredGain;
                    localStorage.setItem("micGainValue", configuredGain.toString());
                    if (inputMicGain) {
                        inputMicGain.value = String(configuredGain);
                    }
                    updateMicGainLabel(configuredGain);
                }

                // 🔥 RESTAURAR HISTORIAL DEL CHAT DESDE FIREBASE
                if (data.chatIA && Array.isArray(data.chatIA)) {
                    chatHistory[id] = data.chatIA;
                } else {
                    chatHistory[id] = [];
                }

                sessionFeed.innerHTML = "";

                if (segmentsData.length === 0) {
                    emptyState.classList.remove("hidden");
                    sessionFeed.appendChild(emptyState);
                } else {
                    emptyState.classList.add("hidden");
                    segmentsData.forEach(renderSegment);
                    setTimeout(() => sessionFeed.scrollTop = sessionFeed.scrollHeight, 100);
                }

                // 🔥 Restaurar tono anterior (prioriza localStorage y evita reprocesar)
                const storedTone = localStorage.getItem("lastTone");
                const toneToRestore = storedTone || data.lastTone;
                if (toneToRestore) {
                    selectAction.value = toneToRestore;
                    if (storedTone !== toneToRestore) {
                        localStorage.setItem("lastTone", toneToRestore);
                    }

                    for (const seg of segmentsData) {
                        if (seg.status === "done" && seg.analyses?.[toneToRestore]) {
                            seg.currentTone = toneToRestore;
                            if (currentSessionId) {
                                persistToneCacheEntry(currentSessionId, seg, toneToRestore);
                            }
                            renderSegment(seg);
                        }
                    }
                }

                // Evitar reprocesar tonos al iniciar; solo generar bajo acción explícita.

                lastLocalSegmentsHash = computeSegmentsHash(segmentsData);

                if (repairedSegments) {
                    await saveSessionToFirebase();
                }
            }

            
            async function deleteSession(sessionId) {
                if (!isFirebaseActive) {
                    showToast('No se puede eliminar: Firebase no está activo.');
                    return;
                }

                try {
                    await deleteDoc(doc(db, 'audioTranslate', sessionId));
                    try {
                        await deleteDoc(doc(db, 'audioTranslateContextNotes', sessionId));
                    } catch (innerErr) {
                    }
                    contextNotesCache.delete(sessionId);
                    showToast('Sesión eliminada correctamente');

                    // Si estabas en esa sesión, resetea la vista
                    if (sessionId === currentSessionId) {
                        currentSessionId = null;
                        segmentsData = [];
                        blockContextNotes = {};
                        sessionFeed.innerHTML = '';
                        emptyState.classList.remove('hidden');
                        currentSessionTitle.textContent = 'Sesión actual';
                    }
                } catch (e) {
                    showToast('Error al eliminar la sesión');
                }
            }

            // -----------------------------------------------------------
            // 5. UI & EVENTS
            // -----------------------------------------------------------

            function updateUIState(recording) {
                if (recording) {
                    // Ocultar botón de inicio
                    btnStart.classList.add('hidden');
                    btnStart.classList.remove('flex');

                    // Mostrar botón de detener
                    btnStop.classList.remove('hidden');
                    btnStop.classList.add('flex');
                    btnStop.disabled = false;

                    // Actualizar botón de siguiente bloque según configuración
                    updateNextBlockButton();

                    // Mostrar badge de estado
                    document.getElementById('statusBadge').classList.remove('hidden');
                } else {
                    // Mostrar botón de inicio
                    btnStart.classList.remove('hidden');
                    btnStart.classList.add('flex');

                    // Ocultar botón de detener
                    btnStop.classList.add('hidden');
                    btnStop.classList.remove('flex');
                    btnStop.disabled = true;

                    // Ocultar botón de siguiente bloque
                    btnNextBlock.classList.add('hidden');
                    btnNextBlock.classList.remove('flex');
                    btnNextBlock.disabled = true;

                    // Ocultar badge de estado
                    document.getElementById('statusBadge').classList.add('hidden');
                }
            }



            function updateStatus(msg) {
                recordingStatus.innerHTML = `
                    <span class="${isRecording ? 'w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2' : 'w-2 h-2 bg-slate-300 rounded-full mr-2'} inline-block"></span>
                    ${msg}
                `;
            }

            function handleToneChange() {
                const tone = selectAction.value;
                segmentsData.forEach(seg => {
                    if (seg.status === 'done') {
                        renderSegment(seg);
                        if (tone !== 'raw' && (!seg.analyses || !seg.analyses[tone])) {
                            generateToneForSegment(seg.id, tone);
                        }
                    }
                });
            }

            function renderSegment(segment) {
                let el = document.getElementById(`seg-${segment.id}`);
                if (!el) {
                    el = document.createElement("div");
                    el.id = `seg-${segment.id}`;
                    el.className = "group relative transition-all duration-500 ease-in-out opacity-0 translate-y-4";
                    sessionFeed.appendChild(el);
                    requestAnimationFrame(() => el.classList.remove("opacity-0", "translate-y-4"));
                }

                // 🔥 Obtener el tono actual del localStorage o usar 'raw' por defecto
                const currentTone = segment.currentTone || 'raw';

                let contentHTML = "";

                // 🎙️ BLOQUE EN GRABACIÓN (con diseño rojo bonito)
                if (segment.status === "recording") {
                    contentHTML = `
                        <div class="flex items-center space-x-3 p-6 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl shadow-lg shadow-red-100 relative overflow-hidden">
                            <!-- Efecto de fondo sutil -->
                            <div class="absolute inset-0 opacity-10">
                                <div class="absolute inset-0 bg-gradient-to-r from-red-200 to-pink-200 animate-pulse"></div>
                            </div>
                            
                            <div class="relative z-10 flex items-center space-x-4 w-full">
                                <div class="relative">
                                    <div class="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                                        <i class="fa-solid fa-microphone text-white text-lg"></i>
                                    </div>
                                    <div class="absolute -inset-2 rounded-full border-2 border-red-300 animate-ping"></div>
                                </div>
                                
                                <div class="flex flex-col flex-1">
                                    <span class="text-red-700 font-medium flex items-center gap-2">
                                        <span>🎙️ Grabando audio en vivo...</span>
                                        <span class="text-xs font-normal bg-red-100 text-red-600 px-2 py-0.5 rounded-full">EN VIVO</span>
                                    </span>
                                    
                                    <div class="flex items-center gap-3 mt-2">
                                        <span id="timer-${segment.id}" class="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded">10:00</span>
                                        <span class="text-xs text-red-500">Bloque #${segment.id}</span>
                                    </div>
                                    
                                    <!-- ONDA DE AUDIO -->
                                    <div class="mt-3 flex items-center gap-3">
                                        <div class="audio-wave">
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                            <div class="audio-bar"></div>
                                        </div>
                                        <span class="text-xs text-red-400" data-audio-level="${segment.id}">Nivel real: 0%</span>
                                    </div>
                                    
                                    <!-- BARRA DE PROGRESO VISUAL -->
                                    <div class="mt-3">
                                        <div class="progress-bar-container">
                                            <div id="progress-${segment.id}" class="progress-bar-fill"></div>
                                        </div>
                                        <div class="flex justify-between text-xs text-red-400 mt-1">
                                            <span>Inicio</span>
                                            <span id="progress-text-${segment.id}">0%</span>
                                            <span>${CHUNK_DURATION_MS / 60000}:00</span>
                                        </div>
                                    </div>

                                    <!-- AQUÍ VA EL NUEVO CÓDIGO DEL INDICADOR DE AUDIO -->
                                    <div class="mt-2 flex items-center gap-2 text-xs">
                                        <div class="flex items-center gap-1">
                                            <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                            <span class="text-red-500 font-medium">Audio detectado</span>
                                        </div>
                                        <span class="text-red-300">•</span>
                                        <span class="text-red-400">Bitrate: 64 kbps</span>
                                        <span class="text-red-300">•</span>
                                        <span class="text-red-400">Calidad: Alta</span>
                                    </div>

                                </div>
                            </div>
                        </div>`;
                }


                // ⚙️ BLOQUE EN PROCESAMIENTO
                else if (segment.status === "processing") {
                    contentHTML = `
                        <div class="relative p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl shadow-lg">
                            <div class="flex items-center space-x-4">
                                <div class="relative">
                                    <div class="animate-spin h-6 w-6 border-3 border-indigo-500 border-t-transparent rounded-full"></div>
                                    <div class="absolute inset-0 rounded-full border-2 border-indigo-300"></div>
                                </div>
                            </div>

                            <!-- MENÚ DE BLOQUE -->
                            <div class="absolute right-3 top-3">
                                <button class="btn-block-menu text-indigo-400 hover:text-indigo-700 p-1.5 rounded-full bg-white shadow-sm" data-id="${segment.id}">
                                    <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
                                </button>
                                <div class="menu-block hidden absolute right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg w-48 py-2 z-90">
                                    <button class="btn-stop-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-yellow-50 hover:text-yellow-800 transition-colors" data-id="${segment.id}">
                                        <i class="fa-solid fa-hand text-xs text-yellow-600"></i>
                                        <span>Detener proceso</span>
                                    </button>
                                    <button class="btn-retry-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sky-50 hover:text-sky-800 transition-colors" data-id="${segment.id}">
                                        <i class="fa-solid fa-rotate-right text-xs text-sky-600"></i>
                                        <span>Reiniciar procesamiento</span>
                                    </button>
                                    <button class="btn-context-note w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-amber-50 hover:text-amber-900 transition-colors" data-id="${segment.id}">
                                        <i class="fa-solid fa-note-sticky text-xs text-amber-600"></i>
                                        <span>Nota de contexto</span>
                                    </button>
                                    <div class="border-t border-slate-100 my-1"></div>
                                    <button class="btn-collapse-all w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors">
                                        <i class="fa-solid fa-compress text-xs text-slate-600"></i>
                                        <span>Colapsar todos</span>
                                    </button>
                                    <button class="btn-expand-all w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors">
                                        <i class="fa-solid fa-expand text-xs text-slate-600"></i>
                                        <span>Expandir todos</span>
                                    </button>
                                    <div class="border-t border-slate-100 my-1"></div>
                                    <button class="btn-delete-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 hover:text-red-700 transition-colors" data-id="${segment.id}">
                                        <i class="fa-solid fa-trash-can text-xs text-red-500"></i>
                                        <span>Eliminar bloque</span>
                                    </button>
                                </div>
                            </div>
                        </div>`;
                }

                // 🚫 BLOQUE CON ERROR
                else if (segment.status === "error") {
                    contentHTML = `
                        <div class="p-6 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-100 rounded-xl relative shadow-lg">
                            <div class="flex items-start gap-3">
                                <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="text-red-800 font-medium">⚠️ Error en el procesamiento</div>
                                    <div class="text-sm text-red-600 mt-1">${segment.error || "Error desconocido"}</div>
                                    <div class="mt-2 text-xs text-red-400">ID del bloque: ${segment.id}</div>
                                </div>
                            </div>

                            <div class="absolute right-2 top-2">
                                <button class="btn-block-menu text-red-400 hover:text-red-700 p-1.5 rounded-full" data-id="${segment.id}">
                                    <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
                                </button>
                                <div class="menu-block hidden absolute right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg w-44 py-2 z-30">
                                    <button class="btn-retry-block w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sky-50 hover:text-sky-700" data-id="${segment.id}">
                                        <i class="fa-solid fa-rotate-right text-xs"></i>
                                        <span>Reintentar procesamiento</span>
                                    </button>
                                    <button class="btn-context-note w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 hover:text-amber-900" data-id="${segment.id}">
                                        <i class="fa-solid fa-note-sticky text-xs text-amber-600"></i>
                                        <span>Nota de contexto</span>
                                    </button>
                                    <div class="border-t border-slate-100 my-1"></div>
                                    <button class="btn-collapse-all w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 hover:text-slate-800">
                                        <i class="fa-solid fa-compress text-xs text-slate-600"></i>
                                        <span>Colapsar todos</span>
                                    </button>
                                    <button class="btn-expand-all w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 hover:text-slate-800">
                                        <i class="fa-solid fa-expand text-xs text-slate-600"></i>
                                        <span>Expandir todos</span>
                                    </button>
                                    <button class="btn-delete-block w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 hover:text-red-700" data-id="${segment.id}">
                                        <i class="fa-solid fa-trash text-xs"></i>
                                        <span>Eliminar bloque</span>
                                    </button>
                                </div>
                            </div>
                        </div>`;
                }

                else if (segment.generatingTone) {
                    contentHTML = `
                        <div class="p-6 bg-gradient-to-r from-sky-50 to-blue-50 border-2 border-sky-200 rounded-xl shadow-lg flex items-center space-x-4">
                            <div class="relative">
                                <div class="animate-spin h-6 w-6 border-3 border-sky-500 border-t-transparent rounded-full"></div>
                                <div class="absolute inset-0 rounded-full border-2 border-sky-300"></div>
                            </div>
                        </div>
                    `;
                }

                // ✅ BLOQUE PROCESADO
                else {
                    const toneLabel = getActionLabel(currentTone);
                    
                    // 🔥 DECIDIR QUÉ TEXTO MOSTRAR BASADO EN EL TONO ACTUAL Y VISTA
                    let displayText = "";
                    let contenidoHTML = "";

                    // Auto-activar vista diálogo cuando se detectan varias personas (para sesiones antiguas)
                    if (segment.analisis_voces && segment.analisis_voces.total_personas > 1 && segment.vistaEstructurada == null) {
                        segment.vistaEstructurada = true;
                        segment.vistaDialogoPlano = false;
                    }
                    
                    if (currentTone !== "raw" && segment.analyses && segment.analyses[currentTone]) {
                        // Mostrar la versión transformada del tono actual
                        displayText = segment.analyses[currentTone];
                        
                        // 🔥 NUEVO: Decidir cómo mostrar según la vista elegida
                        if (segment.vistaEstructurada && segment.analisis_voces) {
                            contenidoHTML = segment.vistaDialogoPlano ? 
                                renderDialogoPlano(segment.texto_dialogado || displayText) : 
                                renderTranscripcionEstructurada(
                                    segment.analisis_voces.transcripcion_estructurada,
                                    segment.analisis_voces.orador_principal
                                );
                        } else {
                            contenidoHTML = formatText(displayText);
                        }
                        
                    } else {
                        // Mostrar texto original (restaurar sin tono)
                        displayText = segment.original_raw || segment.raw || "";
                        
                        // 🔥 NUEVO: Decidir cómo mostrar según la vista elegida
                        if (segment.vistaEstructurada && segment.analisis_voces) {
                            contenidoHTML = segment.vistaDialogoPlano ? 
                                renderDialogoPlano(segment.texto_dialogado || displayText) : 
                                renderTranscripcionEstructurada(
                                    segment.analisis_voces.transcripcion_estructurada,
                                    segment.analisis_voces.orador_principal
                                );
                        } else {
                            contenidoHTML = formatText(displayText);
                        }
                        
                    }

                    // 🌍 CONFIGURAR BADGE DE IDIOMA
                    const idiomaLabel = segment.idioma || "desconocido";
                    const banderas = {
                        "español": "🇪🇸",
                        "inglés": "🇺🇸", 
                        "english": "🇺🇸",
                        "francés": "🇫🇷",
                        "français": "🇫🇷",
                        "portugués": "🇵🇹",
                        "português": "🇵🇹",
                        "italiano": "🇮🇹",
                        "alemán": "🇩🇪",
                        "deutsch": "🇩🇪",
                        "chino": "🇨🇳",
                        "中文": "🇨🇳",
                        "japonés": "🇯🇵",
                        "日本語": "🇯🇵",
                        "coreano": "🇰🇷",
                        "한국어": "🇰🇷"
                    };

                    const idiomaLower = idiomaLabel.toLowerCase();
                    let bandera = "🌐";
                    let idiomaMostrar = idiomaLabel;

                    // Buscar bandera correspondiente
                    for (const [key, value] of Object.entries(banderas)) {
                        if (idiomaLower.includes(key.toLowerCase())) {
                            bandera = value;
                            // Formatear nombre del idioma para mostrar
                            if (key === "english") idiomaMostrar = "Inglés";
                            else if (key === "français") idiomaMostrar = "Francés";
                            else if (key === "português") idiomaMostrar = "Portugués";
                            else if (key === "deutsch") idiomaMostrar = "Alemán";
                            else if (key === "中文") idiomaMostrar = "Chino";
                            else if (key === "日本語") idiomaMostrar = "Japonés";
                            else if (key === "한국어") idiomaMostrar = "Coreano";
                            else if (key === "italiano") idiomaMostrar = "Italiano";
                            break;
                        }
                    }

                    
                    const isCollapsed = segment.collapsed === true;
                    const hasContextNote = hasBlockContextNote(segment.id);

                    contentHTML = `
                        <div class="bg-white p-6 rounded-xl shadow-lg border border-slate-200 relative group hover:shadow-xl transition-all duration-300 ${isCollapsed ? 'segment-collapsed' : ''}">

                            <div class="flex justify-between items-center mb-4">
                                <div class="flex items-center gap-3">
                                    <!-- Badge de tono -->
                                    <button class="tone-badge tone-badge-btn" data-id="${segment.id}" title="Abrir herramientas IA de este bloque">
                                        <i class="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                                        <span>${toneLabel}</span>
                                    </button>
                                    
                                    <div class="flex items-center gap-2">
                                        <span class="context-note-pill ${hasContextNote ? 'is-filled' : 'is-empty'}" data-id="${segment.id}" title="${hasContextNote ? 'Abrir nota de contexto' : 'Agregar nota de contexto'}">
                                            <i class="fa-solid fa-note-sticky text-[9px]"></i>
                                            <span>${hasContextNote ? 'Nota' : 'Nota +'}</span>
                                        </span>
                                        <span class="text-xs text-slate-500 italic">${segment.subtitle || `Bloque ${segment.id}`}</span>
                                        <span class="text-xs text-slate-400 hidden"></span>
                                    </div>
                                </div>

                                <!-- ACCIONES -->
                                <div class="relative flex items-center gap-1">
                                    <button class="btn-toggle-collapse text-slate-400 hover:text-slate-700 p-1.5 rounded-full bg-slate-50 hover:bg-slate-100 transition-colors" data-id="${segment.id}" title="${isCollapsed ? 'Expandir' : 'Contraer'}">
                                        <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-xs"></i>
                                    </button>
                                    <button class="btn-block-menu text-slate-400 hover:text-slate-700 p-1.5 rounded-full bg-slate-50 hover:bg-slate-100 transition-colors" data-id="${segment.id}">
                                        <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
                                    </button>
                                    <div class="menu-block hidden absolute right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg w-52 py-2 z-[9999]">
                                        <button class="btn-retry-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sky-50 hover:text-sky-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-rotate-right text-xs text-sky-600"></i>
                                            <span>Reprocesar bloque</span>
                                        </button>
                                        <button class="btn-ia-tools-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-purple-50 hover:text-purple-800 transition-colors" 
                                                data-id="${segment.id}">
                                            <i class="fa-solid fa-wand-magic-sparkles text-xs text-purple-600"></i>
                                            <span>Herramientas IA</span>
                                        </button>
                                        <button class="btn-edit-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-emerald-50 hover:text-emerald-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-pen-to-square text-xs text-emerald-600"></i>
                                            <span>Editar texto</span>
                                        </button>
                                        <button class="btn-context-note w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-amber-50 hover:text-amber-900 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-note-sticky text-xs text-amber-600"></i>
                                            <span>Nota de contexto</span>
                                        </button>
                                        <button class="btn-copy-block-session w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-copy text-xs text-indigo-600"></i>
                                            <span>Copiar a otra sesión</span>
                                        </button>
                                        <div class="border-t border-slate-100 my-1"></div>
                                        <button class="btn-move-up w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-arrow-up text-xs text-slate-600"></i>
                                            <span>Mover arriba</span>
                                        </button>
                                        <button class="btn-move-down w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-arrow-down text-xs text-slate-600"></i>
                                            <span>Mover abajo</span>
                                        </button>
                                        <button class="btn-move-first w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-arrow-up-from-bracket text-xs text-slate-600"></i>
                                            <span>Mover al primer lugar</span>
                                        </button>
                                        <button class="btn-move-last w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-arrow-down-to-bracket text-xs text-slate-600"></i>
                                            <span>Mover al último lugar</span>
                                        </button>
                                        <button class="btn-move-position w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-list-ol text-xs text-slate-600"></i>
                                            <span>Cambiar posición / número</span>
                                        </button>
                                        <div class="border-t border-slate-100 my-1"></div>
                                        <button class="btn-collapse-all w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors">
                                            <i class="fa-solid fa-compress text-xs text-slate-600"></i>
                                            <span>Colapsar todos</span>
                                        </button>
                                        <button class="btn-expand-all w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors">
                                            <i class="fa-solid fa-expand text-xs text-slate-600"></i>
                                            <span>Expandir todos</span>
                                        </button>
                                        
                                        <!-- AQUÍ VA EL NUEVO BOTÓN DE CAMBIAR VISTA -->
                                        ${segment.analisis_voces && segment.analisis_voces.total_personas > 1 ? `
                                        <button class="btn-toggle-estructurada w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-purple-50 hover:text-purple-800 transition-colors" 
                                                data-id="${segment.id}">
                                            <i class="fa-solid ${segment.vistaEstructurada ? 'fa-paragraph' : 'fa-layer-group'} text-xs text-purple-600"></i>
                                            <span>${segment.vistaEstructurada ? 'Vista normal' : 'Vista diálogo'}</span>
                                        </button>
                                        <button class="btn-toggle-dialogo-plano w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-slate-800 transition-colors" 
                                                data-id="${segment.id}">
                                            <i class="fa-solid ${segment.vistaDialogoPlano ? 'fa-align-left' : 'fa-code'} text-xs text-slate-600"></i>
                                            <span>${segment.vistaDialogoPlano ? 'Diálogo estructurado' : 'Diálogo plano'}</span>
                                        </button>
                                        ` : ''}


                                        
                                        <div class="border-t border-slate-100 my-1"></div>
                                        <button class="btn-delete-block w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 hover:text-red-700 transition-colors" data-id="${segment.id}">
                                            <i class="fa-solid fa-trash text-xs text-red-500"></i>
                                            <span>Eliminar bloque</span>
                                        </button>
                                    </div>

                                </div>
                            </div>

                            <div class="segment-body prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                ${contenidoHTML}
                            </div>
                            <div class="segment-fade"></div>



                            
                            <!-- Indicador de éxito con idioma -->
                            <div class="mt-4 flex items-center gap-2 text-xs text-emerald-600">
                                <i class="fa-solid fa-circle-check"></i>
                                <span>Procesado correctamente</span>
                                
                                ${idiomaLabel !== "desconocido" ? `
                                <span class="text-slate-400">|</span>
                                <span class="text-blue-600 flex items-center gap-1">
                                    ${bandera}
                                    <span>Idioma: ${idiomaMostrar}</span>
                                </span>
                                ` : ''}
                                
                                ${segment.analisis_voces && segment.analisis_voces.total_personas > 1 ? `
                                <span class="text-slate-400">|</span>
                                <span class="text-purple-600 flex items-center gap-1">
                                    <i class="fa-solid fa-users"></i>
                                    <span>${segment.analisis_voces.total_personas} personas</span>
                                </span>
                                ` : ''}
                            </div>

                        </div>`;
                }

                el.innerHTML = `
                    <div class="flex gap-4">
                        <div class="flex-1 min-w-0 animate-fade-in relative">
                            <div class="absolute top-3 left-3 text-[11px] text-slate-400 font-mono opacity-70 font-semibold bg-white/80 px-2 py-0.5 rounded">
                                #${segment.id}
                            </div>
                            ${contentHTML}
                        </div>
                    </div>`;
            }

            function renderTranscripcionEstructurada(transcripciones, oradorPrincipal = "") {
                if (!transcripciones || !Array.isArray(transcripciones)) {
                    return `<p>No hay transcripción estructurada disponible.</p>`;
                }

                let html = `<div class="space-y-2">`;

                transcripciones.forEach((item, index) => {
                    const speakerName = String(item?.persona || "").trim();
                    const principalName = String(oradorPrincipal || "").trim();
                    const esPrincipal = !!speakerName && (
                        (principalName && speakerName === principalName) ||
                        (!principalName && (speakerName === "ORADOR PRINCIPAL" || speakerName === "Persona 1" || speakerName.startsWith("Orador")))
                    );
                    const colorClase = esPrincipal ? 
                        'border-l-2 border-blue-500' : 
                        'border-l-2 border-slate-300';

                    html += `
                        <div class="${colorClase} pl-3 py-1">
                            <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                <span class="font-semibold text-slate-700">${item.persona}</span>
                                ${esPrincipal ? '<span class="principal-speaker-badge">PRINCIPAL</span>' : ''}
                                <span class="text-[10px] text-slate-400">#${index + 1}</span>
                            </div>
                            <div class="text-slate-700 leading-relaxed">
                                ${formatText(item.texto)}
                            </div>
                        </div>
                    `;
                });

                html += `</div>`;
                return html;
            }

            function renderDialogoPlano(textoDialogado) {
                if (!textoDialogado) return `<p>No hay formato de diálogo disponible.</p>`;

                // Asegurar saltos de línea entre hablantes si vienen en un solo párrafo
                let normalizado = textoDialogado
                    .replace(/\r\n/g, "\n")
                    .replace(/([^\n])\s*(Persona|Orador|Hablante|Speaker)\s*(\d+)\s*:/gi, "$1\n$2 $3:")
                    .trim();

                const lineas = normalizado.split('\n').filter(line => line.trim().length > 0);
                let html = `<div class="space-y-3 font-mono text-sm">`;
                
                lineas.forEach(line => {
                    const match = line.match(/^([^:]+):\s*(.+)$/);
                    if (match) {
                        const persona = match[1].trim();
                        const texto = match[2].trim();
                        
                        const color = persona.includes('1') ? 'text-blue-600' : 
                                    persona.includes('2') ? 'text-green-600' :
                                    persona.includes('3') ? 'text-purple-600' : 'text-slate-600';
                        
                        html += `
                            <div class="flex border-l-4 ${color.replace('text', 'border')} pl-3">
                                <div class="w-24 flex-shrink-0 font-bold ${color}">
                                    ${persona}:
                                </div>
                                <div class="flex-1 text-slate-700">
                                    ${texto}
                                </div>
                            </div>
                        `;
                    } else {
                        html += `<div class="text-slate-500 pl-24">${line}</div>`;
                    }
                });
                
                html += `</div>`;
                return html;
            }

            function renderAllSegments() {
                sessionFeed.innerHTML = "";
                if (!segmentsData.length) {
                    emptyState.classList.remove("hidden");
                    sessionFeed.appendChild(emptyState);
                    return;
                }
                emptyState.classList.add("hidden");
                segmentsData.forEach(renderSegment);
                setTimeout(() => sessionFeed.scrollTop = sessionFeed.scrollHeight, 100);
            }

            function renumberSegmentsByOrder() {
                const previousNotes = normalizeContextNotesMap(blockContextNotes);
                const remappedNotes = {};
                segmentsData.forEach((seg, idx) => {
                    const oldKey = String(seg.id);
                    seg.id = idx + 1;
                    if (previousNotes[oldKey]) {
                        remappedNotes[String(seg.id)] = previousNotes[oldKey];
                    }
                });
                blockContextNotes = remappedNotes;
            }

            function moveBlockBy(blockId, delta) {
                if (isRecording) {
                    showToast("Detén la grabación para reordenar bloques.");
                    return;
                }
                const index = segmentsData.findIndex(s => s.id === blockId);
                if (index === -1) return;
                const target = index + delta;
                if (target < 0 || target >= segmentsData.length) return;
                const [seg] = segmentsData.splice(index, 1);
                segmentsData.splice(target, 0, seg);
                renumberSegmentsByOrder();
                renderAllSegments();
                lastLocalSegmentsHash = computeSegmentsHash(segmentsData);
                saveSessionToFirebase();
                persistContextNotesForCurrentSession().catch(() => {});
            }

            function moveBlockToPosition(blockId, position) {
                if (isRecording) {
                    showToast("Detén la grabación para reordenar bloques.");
                    return;
                }
                const index = segmentsData.findIndex(s => s.id === blockId);
                if (index === -1) return;
                const target = Math.max(0, Math.min(segmentsData.length - 1, position));
                if (index === target) return;
                const [seg] = segmentsData.splice(index, 1);
                segmentsData.splice(target, 0, seg);
                renumberSegmentsByOrder();
                renderAllSegments();
                lastLocalSegmentsHash = computeSegmentsHash(segmentsData);
                saveSessionToFirebase();
                persistContextNotesForCurrentSession().catch(() => {});
            }

            async function promptSelectSessionForCopy() {
                return new Promise((resolve) => {
                    const candidates = sessionsIndex.filter(s => s.id !== currentSessionId);
                    if (!candidates.length) {
                        showToast("No hay otras sesiones disponibles.");
                        resolve(null);
                        return;
                    }

                    const overlay = document.createElement("div");
                    overlay.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[1200]";
                    overlay.innerHTML = `
                        <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-200">
                                <h3 class="text-sm font-semibold text-slate-800">Copiar bloque a otra sesión</h3>
                            </div>
                            <div class="p-4 space-y-3">
                                <label class="text-xs text-slate-500">Selecciona una sesión destino</label>
                                <select id="copySessionSelect" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                                    ${candidates.map(s => `<option value="${s.id}">${s.title}</option>`).join("")}
                                </select>
                            </div>
                            <div class="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
                                <button id="copySessionCancel" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
                                <button id="copySessionOk" class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Copiar</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);

                    const cleanup = (value) => {
                        overlay.remove();
                        resolve(value);
                    };

                    overlay.addEventListener("click", (e) => {
                        if (e.target === overlay) cleanup(null);
                    });
                    overlay.querySelector("#copySessionCancel").addEventListener("click", () => cleanup(null));
                    overlay.querySelector("#copySessionOk").addEventListener("click", () => {
                        const select = overlay.querySelector("#copySessionSelect");
                        cleanup(select.value || null);
                    });
                });
            }

            async function saveSegmentsForSession(sessionId, segments) {
                if (!isFirebaseActive || !sessionId) return;
                const user = auth.currentUser;
                if (!user) throw new Error("Usuario no autenticado");

                const segmentsJson = JSON.stringify(segments);
                const segmentsBytes = new TextEncoder().encode(segmentsJson).length;

                if (segmentsBytes > 700_000) {
                    const { url, path } = await saveSegmentsToStorage(sessionId, segmentsJson);
                    await setDoc(doc(db, "audioTranslateSegments", sessionId), {
                        sessionId,
                        segmentsUrl: url,
                        segmentsPath: path,
                        updatedAt: serverTimestamp(),
                        userId: user.uid
                    }, { merge: true });
                    await updateDoc(doc(db, "audioTranslate", sessionId), {
                        lastUpdated: serverTimestamp()
                    });
                    return;
                }

                await updateDoc(doc(db, "audioTranslate", sessionId), {
                    segments,
                    lastUpdated: serverTimestamp()
                });
            }

            async function copyBlockToSession(blockId, targetSessionId) {
                if (!isFirebaseActive) {
                    showToast("Firebase no está activo.");
                    return;
                }
                const seg = segmentsData.find(s => s.id === blockId);
                if (!seg) {
                    showToast("Bloque no encontrado.");
                    return;
                }

                const user = auth.currentUser;
                if (!user) {
                    showToast("Debes iniciar sesión.");
                    return;
                }

                const sessionRef = doc(db, "audioTranslate", targetSessionId);
                const snap = await getDoc(sessionRef);
                if (!snap.exists()) {
                    showToast("Sesión destino no encontrada.");
                    return;
                }

                const data = snap.data() || {};
                const userEmail = user?.email ? user.email.toLowerCase() : null;
                const userUid = user?.uid || null;
                const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith.map(e => String(e).toLowerCase()) : [];
                const sharedWithUids = Array.isArray(data.sharedWithUids) ? data.sharedWithUids.map(String) : [];
                const isOwner = user && data.userId && data.userId === user.uid;
                const isShared = (userEmail && sharedWith.includes(userEmail)) || (userUid && sharedWithUids.includes(userUid));
                if (data.userId && !isOwner && !isShared) {
                    showToast("No tienes permiso para copiar a esa sesión.");
                    return;
                }

                let targetSegments = normalizeSegments(data.segments);
                if (!targetSegments.length) {
                    const fallback = await loadSegmentsFromStorage(targetSessionId);
                    if (fallback.length) targetSegments = fallback;
                }

                const maxId = Math.max(0, ...targetSegments.map(s => typeof s.id === "number" ? s.id : 0));
                const cloned = JSON.parse(JSON.stringify(seg));
                cloned.id = maxId + 1;
                cloned.timestamp = Date.now();
                cloned.status = cloned.raw ? "done" : "stopped";
                delete cloned.timerInterval;
                delete cloned.audioWaveInterval;
                delete cloned.timeoutId;
                delete cloned.generatingTone;
                delete cloned.error;

                targetSegments.push(cloned);
                await saveSegmentsForSession(targetSessionId, targetSegments);
                showToast("✅ Bloque copiado a la sesión destino");
            }



            function resolveRetryToneForSegment(seg) {
                const blockTone = typeof seg?.currentTone === "string" ? seg.currentTone : "";
                if (blockTone && blockTone !== "raw") return blockTone;

                const selectedTone = typeof selectAction?.value === "string" ? selectAction.value : "";
                if (selectedTone && selectedTone !== "raw") return selectedTone;

                const storedTone = localStorage.getItem("lastTone") || "";
                if (storedTone && storedTone !== "raw") return storedTone;

                return "raw";
            }

            function resetSegmentToneData(seg) {
                if (!seg || typeof seg !== "object") return;
                seg.analyses = {};
                seg.analysisContextHashes = {};
                seg.currentTone = "raw";
                delete seg.generatingTone;
            }

            // --- EVENTOS GLOBALES PARA MENÚS DE BLOQUES ---
            function handleSessionFeedClick(e) {
                const menuBtn = e.target.closest(".btn-block-menu");
                const deleteBtn = e.target.closest(".btn-delete-block");
                const contextPill = e.target.closest(".context-note-pill");
                const toneBadgeBtn = e.target.closest(".tone-badge-btn");

                if (contextPill) {
                    e.stopPropagation();
                    const id = Number(contextPill.dataset.id);
                    if (!Number.isFinite(id)) return;
                    openContextNoteEditor(id);
                    return;
                }

                if (toneBadgeBtn) {
                    e.stopPropagation();
                    const blockId = Number(toneBadgeBtn.dataset.id);
                    const segment = segmentsData.find(s => s.id === blockId);
                    if (!segment || !segment.raw) {
                        showToast("Este bloque no tiene texto para analizar.");
                        return;
                    }
                    window.aiModalMode = 'block';
                    window.aiModalBlockId = blockId;
                    openAIModalForBlock(blockId);
                    closeAllBlockMenus();
                    return;
                }

                // ABRIR / CERRAR MENÚ
                if (menuBtn) {
                    e.stopPropagation();
                    openBlockMenuAsPortal(menuBtn);
                    return;
                }

                const renameBlockBtn = e.target.closest(".btn-rename-block");

                if (renameBlockBtn) {
                    e.stopPropagation();
                    const id = Number(renameBlockBtn.dataset.id);
                    const nuevo = prompt("Nuevo nombre o subtítulo para el bloque:");
                    closeAllBlockMenus();
                    if (nuevo && nuevo.trim().length > 0) {
                        const seg = segmentsData.find(s => s.id === id);
                        if (seg) {
                            seg.subtitle = nuevo.trim();
                            renderSegment(seg);
                            saveSessionToFirebase(seg);
                            showToast("Bloque renombrado");
                        }
                    }
                    return;
                }

                

                // ELIMINAR BLOQUE
                if (deleteBtn) {
                    e.stopPropagation();
                    const id = Number(deleteBtn.dataset.id);
                    deleteBlock(id);
                    return;
                }

                // 🛑 DETENER PROCESO ACTUAL
                const stopBtn = e.target.closest(".btn-stop-block");
                if (stopBtn) {
                    e.stopPropagation();
                    const id = Number(stopBtn.dataset.id);
                    const seg = segmentsData.find(s => s.id === id);
                    if (!seg) return;
                    closeAllBlockMenus();
                    seg.status = "stopped";
                    renderSegment(seg);
                    showToast("Bloque detenido manualmente");
                    return;
                }

                // 🔁 REINICIAR PROCESAMIENTO
                const retryBtn = e.target.closest(".btn-retry-block");
                if (retryBtn) {
                    e.stopPropagation();
                    closeAllBlockMenus();

                    // Convertimos el bloque en función asíncrona
                    (async () => {
                        const id = Number(retryBtn.dataset.id);
                        const seg = segmentsData.find(s => s.id === id);
                        if (!seg) {
                            showToast("Bloque no encontrado");
                            return;
                        }
                        const targetTone = resolveRetryToneForSegment(seg);

                        seg.status = "processing";
                        renderSegment(seg);

                        try {
                            if (!seg.raw) {
                                const pending = await getPendingAudio(id);
                                if (!pending || !pending.audio) {
                                    showToast("No hay audio pendiente para reprocesar");
                                    seg.status = "error";
                                    seg.error = "Audio pendiente no disponible";
                                    renderSegment(seg);
                                    return;
                                }
                                await processAudioWithGemini(pending.audio, id, "audio/webm");
                                const updatedSeg = segmentsData.find(s => s.id === id);
                                if (!updatedSeg || !updatedSeg.raw) {
                                    showToast("Bloque reprocesado desde audio");
                                    return;
                                }

                                resetSegmentToneData(updatedSeg);
                                renderSegment(updatedSeg);
                                await saveSessionToFirebase();

                                if (targetTone !== "raw") {
                                    await generateToneForSegment(id, targetTone);
                                    const toneApplied = !!updatedSeg.analyses?.[targetTone];
                                    if (toneApplied) {
                                        showToast(`Bloque reprocesado y tono ${getActionLabel(targetTone)} aplicado`);
                                    } else {
                                        showToast("Bloque reprocesado, pero no se pudo aplicar el tono");
                                    }
                                } else {
                                    showToast("Bloque reprocesado desde audio");
                                }
                                return;
                            }

                            const prompt = `Transcribe nuevamente este bloque y mejora la claridad:
                            """${seg.raw}"""`;

                            const newText = await fetchGeminiTextOnly(prompt);
                            seg.raw = sanitizeRawTranscriptionText(newText || seg.raw);
                            seg.original_raw = seg.raw;
                            resetSegmentToneData(seg);

                            try {
                                seg.analisis_voces = await detectarVocesYHablantes(seg.raw, []);
                                applyContextSpeakerNamesToSegment(seg);
                            } catch (_) {
                                // Si falla diarización en reproceso, mantener texto reprocesado.
                            }

                            seg.status = "done";
                            renderSegment(seg);
                            await saveSessionToFirebase();

                            if (targetTone !== "raw") {
                                await generateToneForSegment(id, targetTone);
                                const toneApplied = !!seg.analyses?.[targetTone];
                                if (toneApplied) {
                                    showToast(`Bloque reprocesado y tono ${getActionLabel(targetTone)} aplicado`);
                                } else {
                                    showToast("Bloque reprocesado, pero no se pudo aplicar el tono");
                                }
                            } else {
                                showToast("Bloque reprocesado con éxito");
                            }
                        } catch (err) {
                            seg.status = "error";
                            seg.error = err.message;
                            renderSegment(seg);
                            showToast("Error al reprocesar bloque");
                        }
                    })(); // ← se autoejecuta
                    return;
                }

                // ✅ AQUÍ VAN LOS NUEVOS EVENT LISTENERS PARA EDITAR BLOQUE
                // BOTÓN PARA EDITAR BLOQUE
                const editBtn = e.target.closest(".btn-edit-block");
                if (editBtn) {
                    e.stopPropagation();
                    const id = Number(editBtn.dataset.id);
                    enableBlockEditing(id);
                    
                    // Cerrar el menú
                    closeAllBlockMenus();
                    return;
                }

                const contextNoteBtn = e.target.closest(".btn-context-note");
                if (contextNoteBtn) {
                    e.stopPropagation();
                    const id = Number(contextNoteBtn.dataset.id);
                    if (!Number.isFinite(id)) return;
                    if (!canEditCurrentSession()) {
                        showToast("Solo el propietario puede modificar notas de contexto.");
                        closeAllBlockMenus();
                        return;
                    }
                    closeAllBlockMenus();
                    openContextNoteEditor(id);
                    return;
                }

                const copyBlockBtn = e.target.closest(".btn-copy-block-session");
                if (copyBlockBtn) {
                    e.stopPropagation();
                    const id = Number(copyBlockBtn.dataset.id);
                    (async () => {
                        const targetSessionId = await promptSelectSessionForCopy();
                        if (!targetSessionId) return;
                        await copyBlockToSession(id, targetSessionId);
                    })();
                    closeAllBlockMenus();
                    return;
                }

                const moveUpBtn = e.target.closest(".btn-move-up");
                if (moveUpBtn) {
                    e.stopPropagation();
                    const id = Number(moveUpBtn.dataset.id);
                    moveBlockBy(id, -1);
                    closeAllBlockMenus();
                    return;
                }

                const moveDownBtn = e.target.closest(".btn-move-down");
                if (moveDownBtn) {
                    e.stopPropagation();
                    const id = Number(moveDownBtn.dataset.id);
                    moveBlockBy(id, 1);
                    closeAllBlockMenus();
                    return;
                }

                const moveFirstBtn = e.target.closest(".btn-move-first");
                if (moveFirstBtn) {
                    e.stopPropagation();
                    const id = Number(moveFirstBtn.dataset.id);
                    moveBlockToPosition(id, 0);
                    closeAllBlockMenus();
                    return;
                }

                const moveLastBtn = e.target.closest(".btn-move-last");
                if (moveLastBtn) {
                    e.stopPropagation();
                    const id = Number(moveLastBtn.dataset.id);
                    moveBlockToPosition(id, segmentsData.length - 1);
                    closeAllBlockMenus();
                    return;
                }

                const movePosBtn = e.target.closest(".btn-move-position");
                if (movePosBtn) {
                    e.stopPropagation();
                    const id = Number(movePosBtn.dataset.id);
                    const input = prompt("Nueva posición (1 a " + segmentsData.length + "):");
                    const pos = Number(input);
                    if (!Number.isFinite(pos)) {
                        showToast("Posición inválida.");
                        return;
                    }
                    moveBlockToPosition(id, pos - 1);
                    closeAllBlockMenus();
                    return;
                }

                // BOTÓN PARA GUARDAR EDICIÓN
                const saveEditBtn = e.target.closest(".btn-save-edit");
                if (saveEditBtn) {
                    e.stopPropagation();
                    const id = Number(saveEditBtn.dataset.id);
                    saveBlockEdit(id);
                    return;
                }

                // BOTÓN PARA CANCELAR EDICIÓN
                const cancelEditBtn = e.target.closest(".btn-cancel-edit");
                if (cancelEditBtn) {
                    e.stopPropagation();
                    const id = Number(cancelEditBtn.dataset.id);
                    cancelBlockEdit(id);
                    return;
                }

                const iaToolsBlockBtn = e.target.closest(".btn-ia-tools-block");
                if (iaToolsBlockBtn) {
                    e.stopPropagation();
                    const blockId = Number(iaToolsBlockBtn.dataset.id);
                    const segment = segmentsData.find(s => s.id === blockId);
                    
                    if (!segment || !segment.raw) {
                        showToast("Este bloque no tiene texto para analizar.");
                        return;
                    }
                    
                    // Configurar para modo bloque
                    window.aiModalMode = 'block';
                    window.aiModalBlockId = blockId;
                    
                    // Abrir modal para bloque específico
                    openAIModalForBlock(blockId);
                    closeAllBlockMenus();
                    return;
                }

                const toggleViewBtn = e.target.closest(".btn-toggle-view");
                if (toggleViewBtn) {
                    e.stopPropagation();
                    const id = Number(toggleViewBtn.dataset.id);
                    const seg = segmentsData.find(s => s.id === id);
                    if (seg) {
                        seg.vistaEstructurada = !seg.vistaEstructurada;
                        renderSegment(seg);
                        saveSessionToFirebase();
                    }
                    return;
                }

                const collapseAllBtn = e.target.closest(".btn-collapse-all");
                if (collapseAllBtn) {
                    e.stopPropagation();
                    setAllBlocksCollapsed(true);
                    closeAllBlockMenus();
                    return;
                }

                const expandAllBtn = e.target.closest(".btn-expand-all");
                if (expandAllBtn) {
                    e.stopPropagation();
                    setAllBlocksCollapsed(false);
                    closeAllBlockMenus();
                    return;
                }

                const toggleCollapseBtn = e.target.closest(".btn-toggle-collapse");
                if (toggleCollapseBtn) {
                    e.stopPropagation();
                    const id = Number(toggleCollapseBtn.dataset.id);
                    const seg = segmentsData.find(s => s.id === id);
                    if (seg) {
                        seg.collapsed = !seg.collapsed;
                        if (currentSessionId) {
                            const collapsedSet = loadCollapsedState(currentSessionId);
                            if (seg.collapsed) collapsedSet.add(id);
                            else collapsedSet.delete(id);
                            saveCollapsedState(currentSessionId, collapsedSet);
                        }
                        renderSegment(seg);
                        saveSessionToFirebase();
                    }
                    return;
                }


                const toggleEstructuradaBtn = e.target.closest(".btn-toggle-estructurada");
                if (toggleEstructuradaBtn) {
                    e.stopPropagation();
                    const id = Number(toggleEstructuradaBtn.dataset.id);
                    const seg = segmentsData.find(s => s.id === id);
                    if (seg) {
                        closeAllBlockMenus();
                        seg.vistaEstructurada = !seg.vistaEstructurada;
                        if (seg.vistaEstructurada) seg.vistaDialogoPlano = false;
                        renderSegment(seg);
                        saveSessionToFirebase();
                    }
                    return;
                }

                const toggleDialogoPlanoBtn = e.target.closest(".btn-toggle-dialogo-plano");
                if (toggleDialogoPlanoBtn) {
                    e.stopPropagation();
                    const id = Number(toggleDialogoPlanoBtn.dataset.id);
                    const seg = segmentsData.find(s => s.id === id);
                    if (seg) {
                        closeAllBlockMenus();
                        seg.vistaDialogoPlano = !seg.vistaDialogoPlano;
                        if (seg.vistaDialogoPlano) seg.vistaEstructurada = true;
                        renderSegment(seg);
                        saveSessionToFirebase();
                    }
                    return;
                }

            }

            sessionFeed.addEventListener("click", handleSessionFeedClick);
            document.addEventListener("click", (e) => {
                if (!e.target.closest(".menu-block.menu-portal")) return;
                e.stopPropagation();
                handleSessionFeedClick(e);
            }, true);

            // cerrar menú si hace clic afuera
            document.addEventListener("click", () => {
                closeAllBlockMenus();
            });
            window.addEventListener("resize", closeAllBlockMenus);
            sessionFeed.addEventListener("scroll", closeAllBlockMenus, { passive: true });

            async function applyToneToAllBlocks(tone, opts = {}) {
                if (!segmentsData || segmentsData.length === 0) {
                    return;
                }

                if (tone === "raw") {
                    resetToOriginalTone();
                    await saveSessionToFirebase();
                    return;
                }
                
                const ids = [];
                const user = auth.currentUser;
                const isOwner = user && currentSessionOwnerId === user.uid;
                if (!opts.fromRemote && isFirebaseActive && currentSessionId) {
                    await updateDoc(doc(db, "audioTranslate", currentSessionId), {
                        lastTone: tone,
                        lastToneRequestedBy: user ? user.uid : null,
                        lastToneRequestedAt: serverTimestamp()
                    });
                }
                if (!isOwner && !opts.fromRemote) {
                    return;
                }
                
                for (const seg of segmentsData) {
                    if (seg.status === "done" && seg.raw) {
                        // Reusar solo si coincide con el contexto (nota) actual del bloque
                        if (isToneAnalysisValidForCurrentContext(seg, tone)) {
                            seg.currentTone = tone;
                            await applyGeminiSpeakerNamesFromContext(seg);
                            if (currentSessionId) {
                                persistToneCacheEntry(currentSessionId, seg, tone);
                            }
                            renderSegment(seg);
                        } else if (!opts.fromRemote) {
                            // Generar nuevo tono solo en acciones locales
                            ids.push(seg.id);
                        }
                    }
                }
                if (!opts.fromRemote && ids.length) {
                    enqueueToneGeneration(ids, tone);
                }
            }


            function resetToOriginalTone() {
                segmentsData.forEach(seg => {
                    seg.currentTone = 'raw';
                    renderSegment(seg);
                });
                showToast("↩️ Restablecido al texto original");
            }


            function getActionLabel(val) {
                // Si tenemos el select, usarlo
                if (selectAction) {
                    const opt = selectAction.querySelector(`option[value="${val}"]`);
                    if (opt) return opt.innerText;
                }
                
                // Fallback: mapear manualmente
                const labels = {
                    'raw': 'Sin tono',
                    'structured': 'Estructurado',
                    'scientific': 'Científico',
                    'academic': 'Académico',
                    'analysis': 'Analítico',
                    'teaching': 'Didáctico',
                    'literary': 'Literario',
                    'child': 'Infantil',
                    'formal': 'Formal',
                    'poetic': 'Poético',
                    'journalistic': 'Periodístico',
                    'conversational': 'Conversacional',
                    'humorous': 'Humorístico'
                };
                
                return labels[val] || val;
            }

            function sanitizeRawTranscriptionText(text) {
                if (!text) return "";
                let cleaned = String(text)
                    .replace(/\r\n/g, "\n")
                    .replace(/```(?:json|text|markdown)?/gi, "")
                    .replace(/```/g, "")
                    .trim();

                const lines = cleaned.split("\n")
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(line => line.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]?\s*/g, ""));

                const filtered = lines.filter((line) => {
                    if (!line) return false;
                    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line)) return false;
                    if (/^(el idioma del audio es|aquí tienes la transcripción literal|aqui tienes la transcripcion literal|aquí tienes la transcripción|aqui tienes la transcripcion|transcripción literal|transcripcion literal|resultado de la transcripci[oó]n|idioma detectado)/i.test(line)) {
                        return false;
                    }
                    return true;
                });

                cleaned = filtered
                    .join("\n")
                    .replace(/[ \t]{2,}/g, " ")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();

                return cleaned;
            }

            function escapeHtmlText(value = "") {
                return String(value ?? "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;");
            }


            function formatText(text) {
                if (!text) return "";
                if (typeof text !== "string") {
                    try {
                        text = JSON.stringify(text);
                    } catch {
                        text = String(text);
                    }
                }

                // Normalizar saltos de línea
                let raw = text.replace(/\r\n/g, "\n").trim();

                // Agrupar líneas en bloques para mejorar párrafos
                const rawLines = raw.split("\n");
                const blocks = [];
                let currentBlock = [];

                for (const line of rawLines) {
                    if (!line.trim()) {
                        if (currentBlock.length) {
                            blocks.push(currentBlock);
                            currentBlock = [];
                        }
                        continue;
                    }
                    currentBlock.push(line);
                }
                if (currentBlock.length) blocks.push(currentBlock);

                const normalizedLines = [];
                const isStructuredLine = (l) =>
                    /^\s*#{1,6}\s+/.test(l) ||
                    /^\s*\d+\.\s+/.test(l) ||
                    /^\s*[*-]\s+/.test(l) ||
                    /^\s*[*-]\s+[^:]+:/.test(l);

                for (const block of blocks) {
                    const hasStructure = block.some(isStructuredLine);
                    if (hasStructure) {
                        block.forEach(l => normalizedLines.push(l.trim()));
                    } else {
                        const joined = block.map(l => l.trim()).join(" ");
                        normalizedLines.push(joined);
                    }
                    normalizedLines.push("");
                }

                if (normalizedLines.length && normalizedLines[normalizedLines.length - 1] === "") {
                    normalizedLines.pop();
                }

                const lines = normalizedLines;

                const htmlParts = [];
                let listBuffer = [];
                let listType = null; // "ul" o "ol"

                function applyInlineFormatting(str) {
                    if (!str) return "";
                    str = escapeHtmlText(str);
                    // Negritas **texto**
                    str = str.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
                    // Cursivas _texto_
                    str = str.replace(/_(.*?)_/g, '<em class="italic text-slate-800">$1</em>');
                    // Cursivas *texto* (evita listas porque aquí ya entran como texto plano)
                    str = str.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic text-slate-800">$2</em>');
                    // Limpiar asteriscos sueltos que puedan quedar
                    str = str.replace(/\*\*/g, "");
                    return str;
                }

                function flushList() {
                    if (!listBuffer.length) return;
                    const items = listBuffer
                        .map(item => `<li class="mb-1">${applyInlineFormatting(item)}</li>`)
                        .join("");
                    const tag = listType === "ol" ? "ol" : "ul";
                    const classes = listType === "ol" 
                        ? "list-decimal pl-5 mb-3" 
                        : "list-disc pl-5 mb-3";
                    htmlParts.push(`<${tag} class="${classes}">${items}</${tag}>`);
                    listBuffer = [];
                    listType = null;
                }

                for (let line of lines) {
                    line = line.trim();
                    if (!line) {
                        flushList();
                        continue;
                    }

                    let m;

                    // Encabezados Markdown (#, ##, ###)
                    if ((m = line.match(/^#{1,6}\s+(.+)/))) {
                        flushList();
                        const level = (line.match(/^#{1,6}/)[0] || "#").length;
                        const content = applyInlineFormatting(m[1].trim());

                        if (level === 1) {
                            htmlParts.push(
                                `<h1 class="text-xl font-bold text-slate-900 mb-3">${content}</h1>`
                            );
                        } else if (level === 2) {
                            htmlParts.push(
                                `<h2 class="text-lg font-semibold text-slate-900 mb-2 mt-3">${content}</h2>`
                            );
                        } else {
                            htmlParts.push(
                                `<h3 class="text-base font-semibold text-slate-900 mb-2 mt-2">${content}</h3>`
                            );
                        }
                        continue;
                    }

                    // Línea en negritas completa "**Título**" -> subtítulo
                    if ((m = line.match(/^\*\*(.+)\*\*$/))) {
                        flushList();
                        const content = applyInlineFormatting(m[1].trim());
                        htmlParts.push(
                            `<h3 class="text-base font-semibold text-slate-900 mb-2 mt-2">${content}</h3>`
                        );
                        continue;
                    }

                    // Ítems tipo "* Título: contenido..." -> subtítulo en negritas + párrafo
                    if ((m = line.match(/^[*-]\s+([^:]+):(.*)$/))) {
                        flushList();
                        const label = applyInlineFormatting(m[1].trim());
                        const rest  = applyInlineFormatting(m[2].trim());
                        htmlParts.push(
                            `<p class="mb-2"><strong class="font-semibold text-slate-900">${label}:</strong> ${rest}</p>`
                        );
                        continue;
                    }

                    // Listas ordenadas "1. texto"
                    if ((m = line.match(/^(\d+)\.\s+(.+)/))) {
                        const itemText = m[2].trim();
                        if (listType && listType !== "ol") flushList();
                        listType = "ol";
                        listBuffer.push(itemText);
                        continue;
                    }

                    // Listas con viñetas "* texto" o "- texto"
                    if (/^[*-]\s+/.test(line)) {
                        const itemText = line.replace(/^[*-]\s+/, "").trim();
                        if (listType && listType !== "ul") flushList();
                        listType = "ul";
                        listBuffer.push(itemText);
                        continue;
                    }

                    // Párrafo normal
                    flushList();
                    const paragraph = applyInlineFormatting(line);
                    htmlParts.push(`<p class="mb-2">${paragraph}</p>`);
                }

                // Cerrar lista pendiente
                flushList();

                return htmlParts.join("\n");
            }


            function showToast(msg) {
                toast.textContent = msg;
                toast.classList.remove('-translate-y-20', 'opacity-0');
                setTimeout(() => toast.classList.add('-translate-y-20', 'opacity-0'), 3000);
            }

            function updateSelectedSessionsUI() {
                if (selectedSessionsCount) {
                    selectedSessionsCount.textContent = `${selectedSessionIds.size} seleccionadas`;
                }
                if (btnMultiAI) {
                    btnMultiAI.disabled = selectedSessionIds.size === 0;
                }
                if (btnMultiChatIA) {
                    btnMultiChatIA.disabled = selectedSessionIds.size === 0;
                }

                if (selectAllSessions) {
                    const visibleIds = Array.from(document.querySelectorAll('.session-item'))
                        .map(el => el.dataset.id)
                        .filter(Boolean);
                    if (!visibleIds.length) {
                        selectAllSessions.checked = false;
                        selectAllSessions.indeterminate = false;
                        return;
                    }
                    const selectedVisible = visibleIds.filter(id => selectedSessionIds.has(id));
                    selectAllSessions.checked = selectedVisible.length === visibleIds.length;
                    selectAllSessions.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
                }
            }

            function getCollapsedKey(sessionId) {
                return `collapsedBlocks_${sessionId}`;
            }

            function loadCollapsedState(sessionId) {
                if (!sessionId) return new Set();
                const raw = localStorage.getItem(getCollapsedKey(sessionId));
                if (!raw) return new Set();
                try {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) return new Set(arr.map(Number));
                } catch {}
                return new Set();
            }

            function saveCollapsedState(sessionId, collapsedSet) {
                if (!sessionId) return;
                const arr = Array.from(collapsedSet);
                localStorage.setItem(getCollapsedKey(sessionId), JSON.stringify(arr));
            }

            function setAllBlocksCollapsed(collapsed) {
                if (!currentSessionId) return;
                const collapsedSet = new Set();
                segmentsData.forEach(seg => {
                    if (!seg || typeof seg.id === "undefined") return;
                    seg.collapsed = !!collapsed;
                    if (seg.collapsed) {
                        collapsedSet.add(Number(seg.id));
                    }
                    renderSegment(seg);
                });
                saveCollapsedState(currentSessionId, collapsedSet);
            }

            window.expandAllBlocks = () => setAllBlocksCollapsed(false);
            window.collapseAllBlocks = () => setAllBlocksCollapsed(true);

            async function applyCurrentToneToAllAndClean() {
                if (!currentSessionId) {
                    showToast("No hay sesión activa.");
                    return;
                }
                const tone = selectAction?.value || "raw";
                if (tone === "raw") {
                    showToast("Selecciona un tono distinto a 'Sin tono'.");
                    return;
                }
                const hasAnalyses = segmentsData.some(s => s.analyses?.[tone]);
                if (!hasAnalyses) {
                    showToast("No hay bloques con ese tono aplicado.");
                    return;
                }
                const ok = confirm("Esto reemplazará el texto base por el tono actual y eliminará otros tonos y caché. ¿Continuar?");
                if (!ok) return;

                segmentsData.forEach(seg => {
                    if (!seg || seg.status !== "done") return;
                    const toned = seg.analyses?.[tone];
                    if (toned) {
                        seg.raw = toned;
                        seg.original_raw = toned;
                    }
                    seg.analyses = {};
                    seg.currentTone = "raw";
                    delete seg.generatingTone;
                    renderSegment(seg);
                });

                localStorage.setItem("lastTone", "raw");
                if (selectAction) selectAction.value = "raw";
                localStorage.removeItem(getToneCacheKey(currentSessionId));

                await saveSessionToFirebase();
                showToast("✅ Sesión depurada y guardada.");
            }

            function getToneCacheKey(sessionId) {
                return `toneCache_${sessionId}`;
            }

            function quickHash(str) {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    hash = (hash << 5) - hash + str.charCodeAt(i);
                    hash |= 0;
                }
                return `${str.length}_${hash}`;
            }

            function getToneContextTextForSegment(seg) {
                if (!seg || typeof seg !== "object" || seg.id == null) return "";
                return (getBlockContextNote(seg.id) || "").trim();
            }

            function getToneContextHashForSegment(seg) {
                const noteText = getToneContextTextForSegment(seg);
                return quickHash(`${TONE_CONTEXT_PROMPT_VERSION}::${noteText || "__no_context_note__"}`);
            }

            function setToneContextHashForSegment(seg, tone, contextHash) {
                if (!seg || !tone) return;
                if (!seg.analysisContextHashes || typeof seg.analysisContextHashes !== "object") {
                    seg.analysisContextHashes = {};
                }
                seg.analysisContextHashes[tone] = contextHash;
            }

            function getToneContextHashFromSegment(seg, tone) {
                if (!seg || !tone) return "";
                const hashes = seg.analysisContextHashes;
                if (!hashes || typeof hashes !== "object") return "";
                return typeof hashes[tone] === "string" ? hashes[tone] : "";
            }

            function isToneAnalysisValidForCurrentContext(seg, tone) {
                if (!seg || !tone || !seg.analyses || !seg.analyses[tone]) return false;
                const expectedHash = getToneContextHashForSegment(seg);
                const storedHash = getToneContextHashFromSegment(seg, tone);
                if (storedHash) {
                    return storedHash === expectedHash;
                }
                // Compatibilidad con sesiones antiguas sin metadatos:
                // sólo reutilizar si no existe nota de contexto.
                return !getToneContextTextForSegment(seg);
            }

            function loadToneCache(sessionId) {
                if (!sessionId) return {};
                const raw = localStorage.getItem(getToneCacheKey(sessionId));
                if (!raw) return {};
                try {
                    const parsed = JSON.parse(raw);
                    return parsed && typeof parsed === "object" ? parsed : {};
                } catch {
                    return {};
                }
            }

            function saveToneCache(sessionId, cache) {
                if (!sessionId) return;
                localStorage.setItem(getToneCacheKey(sessionId), JSON.stringify(cache));
            }

            function persistToneCacheEntry(sessionId, seg, tone) {
                if (!sessionId || !seg || !seg.raw || !tone) return;
                const toneCache = loadToneCache(sessionId);
                const key = String(seg.id);
                const entry = toneCache[key] || { rawHash: quickHash(seg.raw), analyses: {} };
                const contextHash = getToneContextHashForSegment(seg);
                entry.rawHash = quickHash(seg.raw);
                entry.analyses = entry.analyses || {};
                entry.toneContextHashes = (entry.toneContextHashes && typeof entry.toneContextHashes === "object")
                    ? entry.toneContextHashes
                    : {};
                if (seg.analyses?.[tone]) {
                    entry.analyses[tone] = seg.analyses[tone];
                    const storedContextHash = getToneContextHashFromSegment(seg, tone) || contextHash;
                    entry.toneContextHashes[tone] = storedContextHash;
                }
                // Compatibilidad hacia atrás
                entry.noteHash = contextHash;
                entry.currentTone = tone;
                entry.updatedAt = Date.now();
                toneCache[key] = entry;
                saveToneCache(sessionId, toneCache);
            }

            // Init
            if (isFirebaseActive && auth) {
                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        loadSessionsList();
                    }
                });
            } else {
                loadSessionsList();
            }

            async function exportSessionToWord() {
                if (!segmentsData || segmentsData.length === 0) {
                    showToast("No hay transcripciones para exportar.");
                    return;
                }

                const tone = selectAction.value; 
                let combined = "";

                segmentsData.forEach(seg => {
                    if (!seg.raw) return;

                    // Si el tono está activado y existe la versión transformada
                    if (tone !== "raw" && seg.analyses && seg.analyses[tone]) {
                        combined += `<h3>Bloque ${seg.id} (${getActionLabel(tone)})</h3>`;
                        combined += `<p>${seg.analyses[tone]}</p><br>`;
                    } else {
                        // Texto original
                        combined += `<h3>Bloque ${seg.id}</h3>`;
                        combined += `<p>${seg.raw}</p><br>`;
                    }
                });

                if (combined.trim().length === 0) {
                    showToast("No hay texto válido para exportar.");
                    return;
                }

                // Convertir HTML a Word
                const doc = window.htmlDocx.asBlob(combined, { orientation: "portrait" });

                // Descargar
                const link = document.createElement("a");
                link.href = URL.createObjectURL(doc);
                const now = new Date();
                link.download = `Sesion-${now.getHours()}${now.getMinutes()}.docx`;
                link.click();

                showToast("Sesión exportada en Word");
            }

            async function generarTituloSesion(sessionId, contenidoTexto) {
                const prompt = `
            Genera un TÍTULO CORTO y atractivo para esta sesión de audio.
            Debe ser una frase breve (entre 2 y 6 palabras).
            Sin comillas, sin explicaciones, sin formato.

            CONTENIDO DE LA SESIÓN:
            ${contenidoTexto}
            `;

                // 🔧 usar modelo seleccionado
                const model = selectGeminiEndpoint.value;
                const body = { contents: [{ parts: [{ text: prompt }] }] };
                const { data: json } = await geminiBackendFetch("/api/gemini/generate", {
                    method: "POST",
                    body: JSON.stringify({ model, payload: body })
                });
                const titulo = extractGeminiText(json) || "Nueva Sesión";

                if (isFirebaseActive) {
                    const sessionRef = doc(db, "audioTranslate", sessionId);
                    await updateDoc(sessionRef, { title: titulo, updatedAt: serverTimestamp() });
                }

                currentSessionTitle.textContent = titulo;
                loadSessionsList();
                return titulo;
            }


            async function generarTituloDeBloque(texto) {
                const prompt = `
            Genera un SUBTÍTULO muy breve (máx 4 palabras) que describa el contenido del siguiente fragmento de audio.
            Debe ser claro, corto y sin comillas.

            TEXTO:
            ${texto}
                `;

                const result = await fetchGeminiTextOnly(prompt);
                return result?.trim() || "Subtítulo";
            }

            async function deleteBlock(blockId) {
                if (!confirm("¿Eliminar este bloque de transcripción?")) return;
                closeAllBlockMenus();

                // 1. BORRAR DEL ARREGLO
                segmentsData = segmentsData.filter(seg => seg.id !== blockId);
                setBlockContextNoteLocal(blockId, "");

                // 2. BORRAR DEL DOM
                const el = document.getElementById(`seg-${blockId}`);
                if (el) el.remove();

                // 3. GUARDAR EN FIREBASE
                if (isFirebaseActive && currentSessionId) {
                    try {
                        const sessionRef = doc(db, "audioTranslate", currentSessionId);
                        await updateDoc(sessionRef, {
                            segments: segmentsData,
                            lastUpdated: serverTimestamp()
                        });
                        await persistContextNotesForCurrentSession();
                        showToast("Bloque eliminado");
                    } catch (e) {
                        showToast("Error al eliminar bloque");
                    }
                } else {
                    if (currentSessionId) {
                        contextNotesCache.set(currentSessionId, {
                            notes: { ...normalizeContextNotesMap(blockContextNotes) },
                            updatedAt: Date.now()
                        });
                    }
                }

                // 4. Si ya no hay bloques
                if (segmentsData.length === 0) {
                    emptyState.classList.remove("hidden");
                }
            }

            function startCountdownForBlock(blockId, durationMs) {
                const endTime = Date.now() + durationMs;
                const startTime = Date.now();

                const timerEl = document.getElementById(`timer-${blockId}`);
                const progressEl = document.getElementById(`progress-${blockId}`);
                const progressTextEl = document.getElementById(`progress-text-${blockId}`);
                
                if (!timerEl) return;

                const interval = setInterval(() => {
                    const now = Date.now();
                    const remaining = endTime - now;
                    const elapsed = now - startTime;
                    const progressPercent = Math.min((elapsed / durationMs) * 100, 100);

                    if (remaining <= 0) {
                        timerEl.textContent = "00:00";
                        if (progressEl) progressEl.style.width = "100%";
                        if (progressTextEl) progressTextEl.textContent = "100%";
                        clearInterval(interval);
                        return;
                    }

                    const totalSeconds = Math.floor(remaining / 1000);
                    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
                    const seconds = String(totalSeconds % 60).padStart(2, "0");

                    timerEl.textContent = `${minutes}:${seconds}`;
                    
                    // Actualizar barra de progreso
                    if (progressEl) {
                        progressEl.style.width = `${progressPercent}%`;
                    }
                    
                    if (progressTextEl) {
                        progressTextEl.textContent = `${Math.round(progressPercent)}%`;
                    }
                }, 1000);

                // Guardamos el intervalo dentro del segmento por si se necesita cancelar luego
                const seg = segmentsData.find(s => s.id === blockId);
                if (seg) seg.timerInterval = interval;
            }

            // Almacena audio temporal en IndexedDB
            function openAudioDB() {
                return new Promise((resolve, reject) => {
                    const dbReq = indexedDB.open("audioCache", 3);

                    dbReq.onupgradeneeded = () => {
                        const db = dbReq.result;
                        if (!db.objectStoreNames.contains("pending")) {
                            db.createObjectStore("pending", { keyPath: "id" });
                        }
                    };

                    dbReq.onsuccess = () => resolve(dbReq.result);
                    dbReq.onerror = () => reject(dbReq.error);
                });
            }

            async function savePendingAudio(blockId, blob) {
                const db = await openAudioDB();
                const tx = db.transaction("pending", "readwrite");
                tx.objectStore("pending").put({ id: blockId, audio: blob });
            }

            async function loadPendingAudios() {
                const db = await openAudioDB();
                const tx = db.transaction("pending", "readonly");
                const store = tx.objectStore("pending");

                return new Promise(resolve => {
                    const items = [];
                    const cursorReq = store.openCursor();

                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            items.push(cursor.value);
                            cursor.continue();
                        } else resolve(items);
                    };
                    cursorReq.onerror = () => resolve([]);
                });
            }

            async function getPendingAudio(blockId) {
                const db = await openAudioDB();
                const tx = db.transaction("pending", "readonly");
                const store = tx.objectStore("pending");
                return new Promise(resolve => {
                    const req = store.get(blockId);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
            }

            async function deletePendingAudio(blockId) {
                const db = await openAudioDB();
                const tx = db.transaction("pending", "readwrite");
                tx.objectStore("pending").delete(blockId);
            }

            async function loadLastSessionFromFirebase() {
                if (!isFirebaseActive) return null;

                return new Promise(resolve => {
                    const q = query(collection(db, "audioTranslate"), orderBy("createdAt", "desc"));

                    const unsubscribe = onSnapshot(q, (snapshot) => {
                        unsubscribe();

                        if (snapshot.empty) return resolve(null);

                        const docSnap = snapshot.docs[0];
                        resolve({
                            id: docSnap.id,
                            data: docSnap.data()
                        });
                    });
                });
            }

            // ===========================================================
            // 🚫 BLOQUEO DE PÁGINA DURANTE GRABACIÓN
            // ===========================================================

            // 1️⃣ Evitar recargar o cerrar mientras graba
            window.addEventListener("beforeunload", (event) => {
                if (isRecording) {
                    event.preventDefault();
                    event.returnValue = "Hay una grabación en curso. Si sales ahora, se detendrá y podría perderse el bloque actual.";
                    return event.returnValue;
                }
            });

            // 2️⃣ Bloquear navegación interna (por ejemplo, hacer clic en enlaces)
            document.addEventListener("click", (e) => {
                if (isRecording) {
                    const anchor = e.target.closest("a");
                    if (anchor && anchor.href) {
                        e.preventDefault();
                        showToast("🚫 No puedes navegar mientras grabas");
                    }
                }
            });

            // 3️⃣ Mostrar overlay visual mientras se graba (opcional)
            let recordingOverlayDismissed = false;
            function toggleRecordingOverlay(show) {
                let overlay = document.getElementById("recordingOverlay");
                
                if (show) {
                    if (recordingOverlayDismissed) {
                        return;
                    }
                    if (!overlay) {
                        overlay = document.createElement("div");
                        overlay.id = "recordingOverlay";
                        overlay.className = `
                            fixed inset-0 bg-gradient-to-br from-red-500/10 to-pink-500/5 backdrop-blur-md z-[9999] 
                            flex flex-col items-center justify-center text-center transition-all duration-300
                        `;
                        overlay.innerHTML = `
                            <div class="bg-gradient-to-br from-white to-slate-50 px-8 py-6 rounded-2xl shadow-2xl border border-red-100 max-w-md mx-4">
                                <div class="flex justify-end">
                                    <button id="closeRecordingOverlay" class="text-slate-400 hover:text-slate-600" title="Ocultar">
                                        <i class="fa-solid fa-xmark text-lg"></i>
                                    </button>
                                </div>
                                <div class="relative">
                                    <div class="w-20 h-20 mx-auto mb-4 relative">
                                        <div class="absolute inset-0 rounded-full border-4 border-red-200 animate-spin-slow"></div>
                                        <div class="absolute inset-3 rounded-full border-4 border-red-300 animate-spin-slow animation-delay-1000"></div>
                                        <div class="w-12 h-12 rounded-full bg-red-500 mx-auto mt-4 flex items-center justify-center">
                                            <i class="fa-solid fa-microphone text-white text-xl"></i>
                                        </div>
                                    </div>
                                    
                                    <h2 class="text-xl font-bold text-red-700 mb-2">🎙️ Grabación en curso</h2>
                                    <p class="text-slate-600 mb-4">No cierres ni recargues esta ventana.</p>
                                    
                                    <div class="bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                                        <div class="flex items-center justify-center gap-2 text-red-600">
                                            <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                            <span class="text-sm font-medium">Audio activo</span>
                                            <span class="text-xs text-red-400">•</span>
                                            <span class="text-sm">${segmentsData.length} bloque(s)</span>
                                        </div>
                                    </div>
                                    
                                    <button id="stopRecordingOverlayBtn"
                                            class="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-red-200 flex items-center justify-center gap-2">
                                        <i class="fa-solid fa-stop"></i>
                                        <span>Detener grabación</span>
                                    </button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(overlay);

                        const closeBtn = overlay.querySelector("#closeRecordingOverlay");
                        const stopBtn = overlay.querySelector("#stopRecordingOverlayBtn");
                        if (closeBtn) {
                            closeBtn.addEventListener("click", () => {
                                recordingOverlayDismissed = true;
                                overlay.remove();
                            });
                        }
                        stopBtn?.addEventListener("click", stopContinuousRecording);
                        
                        // Añadir estilo para delay de animación
                        const style = document.createElement('style');
                        style.textContent = `
                            .animation-delay-1000 {
                                animation-delay: 1s;
                            }
                        `;
                        document.head.appendChild(style);
                    }
                } else if (overlay) {
                    recordingOverlayDismissed = false;
                    overlay.remove();
                }
            }

            // 4️⃣ Integrar el overlay al iniciar y detener la grabación
            const originalStart = startContinuousRecording;
            startContinuousRecording = async function() {
                await originalStart();
                toggleRecordingOverlay(true);
            };

            const originalStop = stopContinuousRecording;
            stopContinuousRecording = function() {
                originalStop();
                toggleRecordingOverlay(false);
            };

            async function detectarVocesYHablantes(rawText, speakerTurns = []) {
                function normalizeSpeakerName(name) {
                    const raw = String(name || "").trim().replace(/\s+/g, " ");
                    if (!raw) return "";
                    return raw
                        .split(" ")
                        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                        .join(" ");
                }

                function isGenericSpeakerLabel(label) {
                    const key = String(label || "").trim().toLowerCase();
                    return /^(persona|orador|hablante|speaker|voz)\s*\d*$/.test(key);
                }

                function sanitizeSpeakerLine(line) {
                    if (typeof line !== "string") return "";
                    let out = line.trim();
                    if (!out) return "";

                    // Quitar bullets/índices comunes y markdown básico.
                    out = out
                        .replace(/^\s*[-*•]\s*/, "")
                        .replace(/^\s*\d+[.)]\s*/, "")
                        .replace(/\*\*/g, "")
                        .trim();

                    return out;
                }

                function normalizeTranscriptionLines(lines) {
                    const personas = new Set();
                    const transcripcionEstructurada = [];
                    const mapping = new Map();
                    let nextId = 1;

                    for (const line of lines) {
                        const cleanedLine = sanitizeSpeakerLine(line);
                        if (!cleanedLine) continue;

                        const match = cleanedLine.match(/^([^:]+):\s*(.+)$/);
                        if (!match) continue;
                        const originalPersona = match[1].trim();
                        const texto = match[2].trim();
                        if (!texto) continue;

                        const personaKey = originalPersona.toLowerCase().replace(/\s+/g, " ");
                        if (!mapping.has(personaKey)) {
                            let mappedName = "";
                            if (isGenericSpeakerLabel(originalPersona)) {
                                // Si ya trae número explícito (Persona 1, Persona 2...), respetarlo.
                                const explicitNumber = String(originalPersona).match(/(\d+)/);
                                if (explicitNumber && explicitNumber[1]) {
                                    mappedName = `Persona ${explicitNumber[1]}`;
                                } else {
                                    mappedName = `Persona ${nextId++}`;
                                }
                            } else {
                                mappedName = normalizeSpeakerName(originalPersona);
                            }
                            mapping.set(personaKey, mappedName || `Persona ${nextId++}`);
                        }
                        const persona = mapping.get(personaKey);
                        personas.add(persona);
                        transcripcionEstructurada.push({ persona, texto });
                    }

                    const texto_dialogado = transcripcionEstructurada
                        .map(item => `${item.persona}: ${item.texto}`)
                        .join("\n");

                    return {
                        personas,
                        transcripcionEstructurada,
                        texto_dialogado
                    };
                }

                function normalizeSpeakerTurns(turns) {
                    if (!Array.isArray(turns)) return [];
                    return turns
                        .map((t) => {
                            const personaRaw = t?.persona || t?.speaker || t?.hablante || "";
                            const textoRaw = t?.texto || t?.text || t?.utterance || "";
                            const persona = normalizeSpeakerName(String(personaRaw || "").trim());
                            const texto = String(textoRaw || "").trim();
                            if (!persona || !texto) return null;
                            return { persona, texto };
                        })
                        .filter(Boolean);
                }

                const directTurns = normalizeSpeakerTurns(speakerTurns);
                if (directTurns.length >= 2) {
                    const personas = new Set(directTurns.map(t => t.persona));
                    if (personas.size > 1) {
                        const conteoPersonas = {};
                        directTurns.forEach(item => {
                            conteoPersonas[item.persona] = (conteoPersonas[item.persona] || 0) + 1;
                        });
                        let oradorPrincipal = "Persona 1";
                        let maxIntervenciones = 0;
                        Object.entries(conteoPersonas).forEach(([persona, count]) => {
                            if (count > maxIntervenciones) {
                                maxIntervenciones = count;
                                oradorPrincipal = persona;
                            }
                        });

                        return {
                            orador_principal: oradorPrincipal,
                            total_personas: personas.size,
                            transcripcion_estructurada: directTurns,
                            texto_dialogado: directTurns.map(item => `${item.persona}: ${item.texto}`).join("\n")
                        };
                    }
                }

                // 1) Intento directo por líneas (incluye formatos con bullets/markdown)
                const directByLines = normalizeTranscriptionLines(
                    String(rawText || "")
                        .split("\n")
                        .map(sanitizeSpeakerLine)
                        .filter(Boolean)
                );

                if (directByLines.transcripcionEstructurada.length && directByLines.personas.size > 1) {
                    const conteoPersonas = {};
                    directByLines.transcripcionEstructurada.forEach(item => {
                        conteoPersonas[item.persona] = (conteoPersonas[item.persona] || 0) + 1;
                    });
                    let oradorPrincipal = "Persona 1";
                    let maxIntervenciones = 0;
                    Object.entries(conteoPersonas).forEach(([persona, count]) => {
                        if (count > maxIntervenciones) {
                            maxIntervenciones = count;
                            oradorPrincipal = persona;
                        }
                    });

                    return {
                        orador_principal: oradorPrincipal,
                        total_personas: directByLines.personas.size,
                        transcripcion_estructurada: directByLines.transcripcionEstructurada,
                        texto_dialogado: directByLines.texto_dialogado
                    };
                }

                function parseFromTaggedText(text) {
                    const labelRegex = /(^|\n)\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]{0,40})\s*:\s*/g;
                    const validLabel = (label) =>
                        (() => {
                            const clean = String(label || "").trim();
                            if (clean.length < 2 || clean.length > 24) return false;
                            // Evitar frases largas o conectores que no son hablantes.
                            if (/\b(y|pero|porque|entonces|además|sin embargo)\b/i.test(clean)) return false;
                            return true;
                        })();

                    const matches = [];
                    let m;
                    while ((m = labelRegex.exec(text)) !== null) {
                        const label = (m[2] || "").trim();
                        if (!validLabel(label)) continue;
                        matches.push({ label, start: labelRegex.lastIndex, matchIndex: m.index });
                    }

                    if (!matches.length) return null;

                    const lines = [];
                    for (let i = 0; i < matches.length; i++) {
                        const start = matches[i].start;
                        const end = i + 1 < matches.length ? matches[i + 1].matchIndex : text.length;
                        const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
                        if (!slice) continue;
                        lines.push(`${matches[i].label}: ${slice}`);
                    }

                    if (!lines.length) return null;
                    return normalizeTranscriptionLines(lines);
                }

                const tagged = parseFromTaggedText(rawText || "");
                if (tagged && tagged.transcripcionEstructurada.length) {
                    const conteoPersonas = {};
                    tagged.transcripcionEstructurada.forEach(item => {
                        conteoPersonas[item.persona] = (conteoPersonas[item.persona] || 0) + 1;
                    });
                    let oradorPrincipal = "Persona 1";
                    let maxIntervenciones = 0;
                    Object.entries(conteoPersonas).forEach(([persona, count]) => {
                        if (count > maxIntervenciones) {
                            maxIntervenciones = count;
                            oradorPrincipal = persona;
                        }
                    });

                    return {
                        orador_principal: oradorPrincipal,
                        total_personas: tagged.personas.size,
                        transcripcion_estructurada: tagged.transcripcionEstructurada,
                        texto_dialogado: tagged.texto_dialogado
                    };
                }

                const prompt = `
            Analiza el siguiente texto transcrito de una conversación con múltiples personas.

            OBJETIVO: Identificar claramente cada cambio de hablante y estructurar el diálogo.

            REGLA CRÍTICA DE FIDELIDAD:
            - NO cambies las palabras originales del texto.
            - NO traduzcas palabras en otros idiomas.
            - NO corrijas ortografía ni gramática.
            - NO inventes ni completes palabras faltantes.
            - Solo reetiqueta por hablante, manteniendo el contenido literal.

            INSTRUCCIONES:
            1. Detecta cada cambio de hablante basándote en:
            - Cambios de tema o perspectiva
            - Expresiones como "yo pienso", "tú dijiste", etc.
            - Patrones de pregunta-respuesta
            - Cambios en el estilo de habla

            2. Si no puedes identificar claramente a los hablantes, usa:
            - "Persona 1" para el primer hablante
            - "Persona 2" para el segundo hablante
            - etc.

            2.1 Si escuchas un nombre propio explícito (ej. "Juan", "María", "Cris"), úsalo como etiqueta de hablante en lugar de "Persona X".
            - No inventes nombres.
            - Si no estás seguro del nombre, usa "Persona X".

            3. Para diálogos claros con 2 personas, usa:
            - "Persona 1" y "Persona 2"

            4. Para conversaciones grupales, numera secuencialmente.

            5. EL FORMATO DE SALIDA DEBE SER EXACTAMENTE:

            Persona 1: [texto de la persona 1]
            Persona 2: [texto de la persona 2]
            Persona 1: [respuesta de la persona 1]
            Persona 3: [intervención de tercera persona]

            6. Devuelve SOLO el texto estructurado, sin JSON, sin explicaciones.
            7. Mantén consistencia de etiquetas durante toda la conversación.

            TEXTO ORIGINAL:
            """${rawText}"""

            Ahora, estructura este diálogo identificando claramente a cada hablante:
            `;

                try {
                    const result = await fetchGeminiTextOnly(prompt);
                    
                    if (!result || result.trim().length < 10) {
                        // Fallback: devolver texto original estructurado como una sola persona
                        return {
                            orador_principal: "Persona 1",
                            total_personas: 1,
                            transcripcion_estructurada: [
                                {
                                    persona: "Persona 1",
                                    texto: rawText
                                }
                            ],
                            texto_dialogado: `Persona 1: ${rawText}`
                        };
                    }

                    // Procesar el resultado para extraer personas
                    const lines = result.split('\n').filter(line => line.trim().length > 0);
                    const normalized = normalizeTranscriptionLines(lines);
                    const personas = normalized.personas;
                    const transcripcionEstructurada = normalized.transcripcionEstructurada;

                    // Determinar orador principal (el que más habla)
                    const conteoPersonas = {};
                    transcripcionEstructurada.forEach(item => {
                        conteoPersonas[item.persona] = (conteoPersonas[item.persona] || 0) + 1;
                    });
                    
                    let oradorPrincipal = "Persona 1";
                    let maxIntervenciones = 0;
                    Object.entries(conteoPersonas).forEach(([persona, count]) => {
                        if (count > maxIntervenciones) {
                            maxIntervenciones = count;
                            oradorPrincipal = persona;
                        }
                    });

                    return {
                        orador_principal: oradorPrincipal,
                        total_personas: personas.size,
                        transcripcion_estructurada: transcripcionEstructurada,
                        texto_dialogado: normalized.texto_dialogado // Guardamos el texto con formato diálogo normalizado
                    };
                    
                } catch (e) {
                    return {
                        orador_principal: "Persona 1",
                        total_personas: 1,
                        transcripcion_estructurada: [
                            {
                                persona: "Persona 1",
                                texto: rawText
                            }
                        ],
                        texto_dialogado: `Persona 1: ${rawText}`
                    };
                }
            }



            async function renameSession(sessionId, nuevoNombre) {
                if (!isFirebaseActive) return;

                try {
                    const ref = doc(db, "audioTranslate", sessionId);
                    await updateDoc(ref, {
                        title: nuevoNombre,
                        lastUpdated: serverTimestamp()
                    });
                    showToast("Nombre de sesión actualizado");
                    if (sessionId === currentSessionId) {
                        currentSessionTitle.textContent = nuevoNombre;
                    }
                    loadSessionsList();
                } catch (e) {
                    showToast("Error al renombrar");
                }
            }

            // ===== MODAL CAMBIAR TONO =====
        window.addEventListener("load", () => {

            const toneModal = document.getElementById("toneModal");
            const btnCloseToneModal = document.getElementById("btnCloseToneModal");
            const btnGlobalTone = document.getElementById("btnGlobalTone");
            const sessionFeed = document.getElementById("sessionFeed");

            if (!btnGlobalTone || !toneModal || !sessionFeed) {
                // Modal de tono legado no presente, omitir sin warnings
                return;
            }

            let toneTargetBlock = null;
            let toneGlobalMode = false;

            // Abrir modal desde menú de bloque
            sessionFeed.addEventListener("click", (e) => {
                const toneBtn = e.target.closest(".btn-change-tone");
                if (toneBtn) {
                    e.stopPropagation();
                    toneTargetBlock = Number(toneBtn.dataset.id);
                    toneModal.classList.remove("hidden");
                    toneModal.classList.add("flex");
                }
            });

            // Abrir modal desde botón global
            btnGlobalTone.addEventListener("click", () => {
                if (!segmentsData.some(s => s.raw && s.status === "done")) {
                    showToast("No hay bloques transcritos para aplicar tono.");
                    return;
                }
                toneGlobalMode = true;
                toneModal.classList.remove("hidden");
                toneModal.classList.add("flex");
            });

            // Cerrar modal
            btnCloseToneModal.addEventListener("click", () => {
                toneModal.classList.add("hidden");
                toneModal.classList.remove("flex");
            });
            toneModal.addEventListener("click", (e) => {
                if (e.target === toneModal) {
                    toneModal.classList.add("hidden");
                    toneModal.classList.remove("flex");
                }
            });
        });


        document.querySelectorAll('[onclick*="stopContinuousRecording"]').forEach(btn => {
            btn.removeAttribute('onclick');
            btn.addEventListener('click', stopContinuousRecording);
        });

        document.addEventListener('DOMContentLoaded', () => {
            // Reemplazar onclick global con event listeners
            document.querySelectorAll('button').forEach(btn => {
                if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes('stopContinuousRecording')) {
                    btn.removeAttribute('onclick');
                    btn.addEventListener('click', stopContinuousRecording);
                }
            });
            
            // Verificar compatibilidad inicial
            if (!checkMediaRecorderCompatibility().supported) {
                btnStart.disabled = true;
                btnStart.innerHTML = '<i class="fa-solid fa-ban text-lg"></i>';
                btnStart.title = "Navegador no compatible";
                showToast("Tu navegador no soporta grabación de audio. Usa Chrome o Edge.");
            }
        });

        // -----------------------------------------------------------
            // FUNCIÓN PARA LIMPIAR CACHÉ DE ANÁLISIS
            // -----------------------------------------------------------
            function clearAnalysisCache(sessionId = null) {
                if (sessionId) {
                    // Limpiar solo análisis de esta sesión
                    const types = ['resumen', 'analisis', 'sintesis', 'curso', 'ideas'];
                    types.forEach(type => {
                        localStorage.removeItem(`${sessionId}_${type}`);
                    });
                } else {
                    // Limpiar todo el caché de análisis
                    Object.keys(localStorage).forEach(key => {
                        if (key.includes('_resumen') || key.includes('_analisis') || 
                            key.includes('_sintesis') || key.includes('_curso') || 
                            key.includes('_ideas')) {
                            localStorage.removeItem(key);
                        }
                    });
                }
                showToast("Caché de análisis limpiado");
            }

        document.addEventListener('DOMContentLoaded', function() {
        const toggleBtn = document.getElementById('toggleSessionSidebarBtn');
        const sidebarIcon = document.getElementById('sidebarIcon');
        const sidebarText = document.getElementById('sidebarText');
        const sessionSidebar = document.getElementById('sessionSidebar');
        const closeBtn = document.getElementById('closeSessionSidebarBtn');
        const floatingControls = document.getElementById('floatingControls');
        const sessionHeaderButtons = document.getElementById('sessionHeaderButtons');
        const sessionHeaderButtonsAnchor = document.getElementById('sessionHeaderButtonsAnchor');
        
        // Estado inicial
        let isHidden = false;
        const isMobileViewport = () => window.innerWidth < 768;
        let wasMobileViewport = isMobileViewport();
        
        // Función para ocultar sidebar completamente
        function hideSidebar() {
            sessionSidebar.classList.add('session-hidden');
            sessionSidebar.classList.remove('session-collapsed');
            isHidden = true;
            document.body.classList.remove('session-open');

            if (floatingControls && sessionHeaderButtons) {
                floatingControls.prepend(sessionHeaderButtons);
            }
            
            // Actualizar botón dentro del sidebar (aunque esté oculto, se actualiza para cuando se muestre)
            sidebarIcon.classList.remove('fa-eye-slash');
            sidebarIcon.classList.add('fa-eye');
            sidebarText.textContent = 'Mostrar';
            toggleBtn?.setAttribute('aria-label', 'Mostrar sesiones');
            toggleBtn?.setAttribute('title', 'Mostrar sesiones');
        }
        
        // Función para mostrar sidebar
        function showSidebar() {
            sessionSidebar.classList.remove('session-hidden');
            sessionSidebar.classList.remove('session-collapsed');
            isHidden = false;
            document.body.classList.add('session-open');

            if (sessionHeaderButtonsAnchor && sessionHeaderButtons) {
                sessionHeaderButtonsAnchor.parentNode.insertBefore(
                    sessionHeaderButtons,
                    sessionHeaderButtonsAnchor.nextSibling
                );
            }
            
            // Actualizar botón
            sidebarIcon.classList.remove('fa-eye');
            sidebarIcon.classList.add('fa-eye-slash');
            sidebarText.textContent = 'Ocultar';
            toggleBtn?.setAttribute('aria-label', 'Ocultar sesiones');
            toggleBtn?.setAttribute('title', 'Ocultar sesiones');
        }
        
        // Toggle desde botón dentro del sidebar
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (isHidden) {
                    showSidebar();
                } else {
                    hideSidebar();
                }
            });
        }

        // Ajustar estado inicial
        if (isMobileViewport()) {
            hideSidebar();
        } else {
            showSidebar();
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!isHidden) {
                    hideSidebar();
                }
            });
        }
        
        // También contraer haciendo clic fuera (solo en móvil)
        document.addEventListener('click', function(e) {
            const clickedToggleBtn = toggleBtn ? toggleBtn.contains(e.target) : false;
            const clickedInsideSidebar = sessionSidebar ? sessionSidebar.contains(e.target) : false;

            if (isHidden) {
                return;
            }
            
            if (!clickedInsideSidebar && 
                !clickedToggleBtn &&
                !isHidden && 
                isMobileViewport()) {
                hideSidebar();
            }
        });

        window.addEventListener('resize', () => {
            const isMobileNow = isMobileViewport();
            if (isMobileNow !== wasMobileViewport) {
                if (isMobileNow) {
                    hideSidebar();
                } else {
                    showSidebar();
                }
                wasMobileViewport = isMobileNow;
            }
        });
    });

    // Función para verificar configuración en tiempo real
    function verificarConfiguracionActual() {
        
        // Mostrar en pantalla también
        const minutos = CHUNK_DURATION_MS / 60000;
        showToast(`Config actual: ${minutos}min, ${preferredAudioSource}, auto:${autoNextBlock}, gain:${formatMicGain(micGainValue)}`);
    }

    // Hacerla accesible desde consola
    window.verificarConfiguracionActual = verificarConfiguracionActual;
