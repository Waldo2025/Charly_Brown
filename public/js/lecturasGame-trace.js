const TRACE_APP_VERSION = "20260316-trace-indie-v3";
const LECTURAS_TRACE_ACTIVE_READING_KEY = "cb_trace_active_reading_v1";
const TRACE_DEFAULT_STORAGE_BUCKET = "charly-brown.firebasestorage.app";

function initTraceGame() {
  injectStyles();

  const root = resolveRoot();
  if (!root) return null;

  const state = createInitialState();
  hydrateReadingContext(state);
  root.innerHTML = renderTemplate(state);
  loadReadingBackground(state, root);

  const ui = {
    root,
    stage: root.querySelector("#traceStage"),
    canvas: root.querySelector("#traceCanvas"),
    shell: root.querySelector("#traceGameShell"),
    topbar: root.querySelector("#traceTopbar"),
    controls: root.querySelector("#traceCanvasControls"),
    ctx: null,
    video: root.querySelector("#traceCameraFeed"),
    status: root.querySelector("#traceStatus"),
    letter: root.querySelector("#traceCurrentLetter"),
    progress: root.querySelector("#traceProgress"),
    score: root.querySelector("#traceScore"),
    combo: root.querySelector("#traceCombo"),
    timer: root.querySelector("#traceTimer"),
    currentWord: root.querySelector("#traceCurrentWord"),
    hint: root.querySelector("#traceHint"),
    mode: root.querySelector("#traceMode"),
    introModal: root.querySelector("#traceIntroModal"),
    buttons: Array.from(root.querySelectorAll(".trace-touch-btn"))
  };

  ui.ctx = ui.canvas.getContext("2d", { alpha: true });
  if (!ui.ctx) return null;

  wireUi(ui, state);
  resizeCanvas(ui, state);
  setupInput(ui, state);
  setupKeyboard(state);
  exposeDebugApi(state, ui);
  bootstrapCameraForHandControl(state, ui);

  let rafId = 0;
  let lastTs = performance.now();

  const frame = async (ts) => {
    const dt = Math.min(48, Math.max(8, ts - lastTs));
    lastTs = ts;

    await updateCameraPose(state, ui, ts);
    updateGame(state, ui, dt, ts);
    render(state, ui);

    rafId = window.requestAnimationFrame(frame);
  };

  rafId = window.requestAnimationFrame(frame);

  const stop = () => {
    window.cancelAnimationFrame(rafId);
    stopReadingMusic(state);
    stopCamera(state);
  };

  window.addEventListener("beforeunload", stop, { once: true });
  state._stop = stop;

  return root;
}

function bootstrapCameraForHandControl(state, ui) {
  Promise.resolve(enableCamera(state, ui))
    .then(() => {
      if (state.camera.ready) {
        state.textStatus = "Cámara lista. Toca o haz clic para trazar.";
      } else {
        state.textStatus = "Usa el mouse o touch para trazar.";
      }
      refreshHud(ui, state);
    })
    .catch(() => {
      state.textStatus = "Usa el mouse o touch para trazar.";
      refreshHud(ui, state);
    });
}

function createInitialState() {
  const urlParams = new URLSearchParams(window.location.search || "");
  const isCoupleMode = urlParams.get("couple") === "1" || urlParams.get("couple") === "true";

  return {
    version: TRACE_APP_VERSION,
    themeIndex: 0,
    themes: ["kawaii", "tech", "matsuri"],
    mode: "intro",
    coupleMode: isCoupleMode,
    letters: ["A", "E", "M", "O", "S"],
    letterIndex: 0,
    secondaryLetters: isCoupleMode ? ["A", "E", "M", "O", "S"] : [],
    secondaryLetterIndex: 0,
    roundMs: 60000,
    roundLeftMs: 60000,
    score: 0,
    combo: 0,
    streak: 0,
    progress: 0,
    secondary: isCoupleMode ? {
      checkpoints: [],
      playerTrail: [],
      traceActive: false,
      progress: 0,
      letterIndex: 0,
      score: 0,
      combo: 0
    } : null,
    checkpoints: [],
    level: 1,
    bestScore: 0,
    gems: 0,
    totalScore: 0,
    traceFlow: {
      checkpointIndex: 0,
      strokeIndex: 0,
      strokeStartConfirmed: false,
      requiresPinch: true,
      pinchActive: false,
      pinchStrength: 0,
      offTrackMs: 0,
      wrongDirectionMs: 0
    },
    countdown: {
      active: false,
      durationMs: 3000,
      goHoldMs: 640,
      endAt: 0
    },
    fx: {
      shake: {
        active: false,
        elapsedMs: 0,
        durationMs: 0,
        amplitude: 0,
        frequencyX: 0.125,
        frequencyY: 0.168
      },
      lastRocketAt: 0,
      lastMistakeAt: 0
    },
    playerTrail: [],
    traceActive: false,
    startedAt: 0,
    tokens: [],
    lastTokenSpawnMs: 0,
    lastTraceSound: 0,
    tutorialSeen: false,
    particles: [],
    camera: {
      ready: false,
      enabled: false,
      error: "",
      stream: null,
      visionReady: false,
      handLandmarker: null,
      visionModule: null
    },
    pointer: {
      x: 480,
      y: 270,
      targetX: 480,
      targetY: 270,
      radius: 24,
      source: "pointer",
      velocityX: 0,
      velocityY: 0
    },
    cameraHand: {
      confidence: 0,
      x: 0,
      y: 0,
      pinchDistanceNorm: 1
    },
    keyboard: {
      left: false,
      right: false,
      up: false,
      down: false,
      active: false
    },
    dwell: {
      targetAction: "",
      elapsed: 0,
      thresholdMs: 760,
      cooldownUntilMs: 0
    },
    gestureClick: {
      lastClosed: false,
      cooldownUntilMs: 0
    },
    autoDemo: false,
    textStatus: "Listo para trazar",
    reading: {
      id: "",
      title: "Lectura",
      grade: "",
      html: "",
      sourceCollection: "",
      musicAssets: {}
    },
    wordPool: [],
    currentWord: "",
    readingBg: {
      url: "",
      image: null,
      ready: false
    },
    view: {
      width: 960,
      height: 540,
      dpr: 1
    },
    audio: {
      ctx: null,
      music: {
        audioEl: null,
        url: "",
        lastError: ""
      },
      traceLoop: {
        osc: null,
        gain: null,
        active: false
      }
    }
  };
}

function resolveRoot() {
  document.body.classList.add("trace-fullscreen-mode");
  const main = document.querySelector("main");
  if (main) main.style.display = "none";
  const modalSection = document.querySelector("#lecturasGameModeModal, .lecturas-game-mode-section, .lecturas-game-mode-modal");
  if (modalSection) modalSection.style.display = "none";

  let mount = document.getElementById("traceIndependentMount");
  if (!mount) {
    mount = document.createElement("section");
    mount.id = "traceIndependentMount";
    document.body.appendChild(mount);
  }
  return mount;
}

function hydrateReadingContext(state) {
  const reading = resolveTraceReadingContext();
  if (!reading) return;
  state.reading.id = String(reading.id || "").trim();
  state.reading.title = String(reading.titulo || reading.title || "Lectura").trim() || "Lectura";
  state.reading.grade = String(reading.grado || reading.grade || "").trim();
  state.reading.sourceCollection = String(reading.sourceCollection || reading.collection || "").trim();
  state.reading.html = String(reading.htmlLectura || reading.html || "").trim();
  state.reading.musicAssets = normalizeReadingMusicAssets(reading);
  state.reading.images = extractImagesFromReading(state.reading.html);
  if (String(reading.imagenUrl || reading.coverImage || "").trim()) {
    state.readingBg.url = String(reading.imagenUrl || reading.coverImage || "").trim();
  }
  const pool = extractWordsFromReading(state.reading.html);
  state.wordPool = pool.slice(0, 40);
  const letters = deriveTraceLettersFromWords(pool, state.level);
  if (letters.length) state.letters = letters;
  if (state.coupleMode && letters.length) state.secondaryLetters = [...letters].sort(() => Math.random() - 0.5).slice(0, letters.length);
  state.currentWord = state.wordPool[0] || "";

  // Initialize Level from session storage or local profile
  try {
    const activeReadingRaw = sessionStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY) || localStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY);
    const context = activeReadingRaw ? JSON.parse(activeReadingRaw) : null;
    const session = context?.session || context?.user || null;
    if (session) {
      // Use helper from order app if available globally, otherwise fallback to local
      if (window.cbLecturasGameRuntime && typeof window._lecturasGameGetSessionProfileSnapshotByGame === 'function') {
        const snap = window._lecturasGameGetSessionProfileSnapshotByGame(session, "trace");
        state.level = Math.max(1, snap.level || 1);
        state.gems = snap.gems || 0;
        state.totalScore = snap.totalScore || 0;
        state.bestScore = snap.bestScore || 0;
      } else {
        const profilesRaw = localStorage.getItem("cb_lecturas_game_players_v1");
        const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
        const alias = session.alias || session.username || "";
        const playerKey = String(alias).toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 64);
        const player = profiles[playerKey] || {};
        const stats = player.gameStats?.trace || {};
        state.level = Math.max(1, stats.level || 1);
        state.gems = stats.gems || 0;
        state.totalScore = stats.totalScore || 0;
        state.bestScore = stats.bestScore || 0;
      }
    }
  } catch (e) {
    console.warn("[Trace] Failed to load level context", e);
  }
}

function resolveTraceReadingContext() {
  let payload = null;
  try {
    const raw = sessionStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY) || "";
    payload = raw ? JSON.parse(raw) : null;
  } catch (_) {
    payload = null;
  }
  if (!payload) {
    try {
      const raw = localStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY) || "";
      payload = raw ? JSON.parse(raw) : null;
    } catch (_) {
      payload = null;
    }
  }
  if (!payload && window.__LECTURAS_GAME_ACTIVE_READING__ && typeof window.__LECTURAS_GAME_ACTIVE_READING__ === "object") {
    payload = window.__LECTURAS_GAME_ACTIVE_READING__;
  }

  const query = new URLSearchParams(window.location.search || "");
  const queryReadingId = String(query.get("readingId") || "").trim();
  if (payload && queryReadingId && String(payload?.id || "").trim() && String(payload.id).trim() !== queryReadingId) {
    payload = null;
  }

  if (payload) return payload;

  return {
    id: queryReadingId,
    titulo: String(query.get("readingTitle") || "").trim(),
    sourceCollection: String(query.get("sourceCollection") || "").trim(),
    imagenUrl: String(query.get("readingImage") || query.get("bg") || "").trim(),
    htmlLectura: "",
    musicAssets: {
      gameUrl: String(query.get("musicGameUrl") || query.get("gameMusicUrl") || "").trim(),
      gamePath: String(query.get("musicGamePath") || "").trim(),
      readingUrl: String(query.get("musicReadingUrl") || "").trim(),
      readingPath: String(query.get("musicReadingPath") || "").trim(),
      bucket: String(query.get("musicBucket") || "").trim()
    }
  };
}

function normalizeReadingMusicAssets(reading = {}) {
  const assets = (reading?.musicAssets && typeof reading.musicAssets === "object") ? reading.musicAssets : {};
  const rawMusic = (reading?.music && typeof reading.music === "object") ? reading.music : {};
  return {
    gameUrl: String(assets.gameUrl || assets.juegoUrl || rawMusic.gameUrl || rawMusic.juegoUrl || reading?.musicGameUrl || "").trim(),
    gamePath: String(assets.gamePath || assets.juegoPath || rawMusic.gamePath || rawMusic.juegoPath || reading?.musicGamePath || "").trim(),
    readingUrl: String(assets.readingUrl || assets.lecturaUrl || rawMusic.readingUrl || rawMusic.lecturaUrl || reading?.musicReadingUrl || "").trim(),
    readingPath: String(assets.readingPath || assets.lecturaPath || rawMusic.readingPath || rawMusic.lecturaPath || reading?.musicReadingPath || "").trim(),
    bucket: String(assets.bucket || rawMusic.bucket || reading?.musicBucket || "").trim()
  };
}

function extractWordsFromReading(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "").replace(/></g, "> <");
  const text = String(wrap.textContent || wrap.innerText || "").toUpperCase();
  if (!text) return [];
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-ZÑ\s]/g, " ");
  const words = clean.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const stop = new Set(["EL", "LA", "LOS", "LAS", "UN", "UNA", "Y", "O", "DE", "DEL", "AL", "EN", "POR", "PARA", "CON", "SIN", "QUE", "SE", "SU", "ES", "SON", "LO", "LE"]);
  const scored = new Map();
  words.forEach((w) => {
    if (w.length < 3 || stop.has(w)) return;
    const score = (scored.get(w) || 0) + 1 + (w.length >= 6 ? 0.4 : 0);
    scored.set(w, score);
  });
  return Array.from(scored.entries())
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map((entry) => entry[0]);
}

function extractImagesFromReading(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  const images = [];
  wrap.querySelectorAll("img").forEach((img) => {
    const src = img.src || img.getAttribute("data-src") || img.getAttribute("srcset");
    if (src && !src.includes("logo") && !src.includes("icon")) {
      images.push(src);
    }
  });
  return images;
}

function deriveTraceLettersFromWords(words = [], level = 1) {
  const supported = new Set(Object.keys(LETTER_STROKES));
  // 1. Calculate frequency of all supported characters
  const charFreq = new Map();
  words.forEach(w => {
    for (const ch of w) {
      if (supported.has(ch)) charFreq.set(ch, (charFreq.get(ch) || 0) + 1);
    }
  });
  const topChars = Array.from(charFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  // 2. Extract most frequent words and syllables (that consist of supported chars)
  const isSupported = (str) => [...str].every(ch => supported.has(ch));
  const validWords = words.filter(w => w.length >= 3 && isSupported(w));
  const validSyllables = [];
  words.forEach(w => {
    for (let i = 0; i < w.length - 1; i++) {
      const syl = w.substring(i, i + 2);
      if (isSupported(syl)) validSyllables.push(syl);
    }
  });

  const topSyllables = Array.from(new Set(validSyllables)).slice(0, 10);
  const topWords = validWords.slice(0, 10);

  // 3. Select items based on level
  // Level 1-5: Single Letters
  // Level 6-10: Syllables
  // Level 11+: Full words
  if (level <= 5) return topChars.length ? topChars : ["A", "E", "I", "O", "U"];
  if (level <= 10) return topSyllables.length ? topSyllables : ["MA", "ME", "MI", "MO", "MU"];
  return topWords.length ? topWords : ["MAMA", "MASA", "MESA"];
}

function renderTemplate(state) {
  const letter = state.letters[state.letterIndex] || "A";
  const letter2 = state.coupleMode ? (state.secondaryLetters[state.secondaryLetterIndex] || "A") : "";
  const readingTitle = escapeHtml(state.reading.title || "Lectura");
  const readingWord = escapeHtml(state.currentWord || "PALABRA");
  const isCouple = state.coupleMode;

  const playerA = `
    <div class="trace-player-area" id="tracePlayerA">
      <div class="trace-player-label">Jugador A</div>
      <div class="trace-player-canvas-wrap">
        <canvas id="traceCanvasA" width="960" height="540" aria-label="Lienzo de trazos jugador A"></canvas>
      </div>
      <div class="trace-player-info">
        <span>Letra: <b>${letter}</b></span>
        <span>Puntos: <b id="traceScoreA">0</b></span>
      </div>
    </div>
  `;

  const playerB = `
    <div class="trace-player-area" id="tracePlayerB">
      <div class="trace-player-label">Jugador B</div>
      <div class="trace-player-canvas-wrap">
        <canvas id="traceCanvasB" width="960" height="540" aria-label="Lienzo de trazos jugador B"></canvas>
      </div>
      <div class="trace-player-info">
        <span>Letra: <b>${letter2}</b></span>
        <span>Puntos: <b id="traceScoreB">0</b></span>
      </div>
    </div>
  `;

  return `
    <section class="trace-game-shell lecturas-game-shell theme-${state.themes[state.themeIndex]}${isCouple ? ' couple-mode' : ''}" id="traceGameShell" aria-label="Juego de trazos${isCouple ? ' en pareja' : ''}">
      <header class="trace-topbar" id="traceTopbar">
        <div>
          <h2>Trazos de letras - ${readingTitle}${isCouple ? ' (Pareja)' : ''}</h2>
          <p id="traceHint" class="trace-hint">Traza las letras con el dedo o mouse.</p>
        </div>
        <div class="trace-pill-row">
          <span class="trace-pill">Letra <b id="traceCurrentLetter">${letter}</b></span>
          <span class="trace-pill">Nivel <b id="traceLevel">${state.level}</b></span>
          <span class="trace-pill">Puntos <b id="traceScore">${state.score}</b></span>
          <span class="trace-pill">Modo <b id="traceMode">${state.mode}</b></span>
          <span class="trace-pill">Progreso <b id="traceProgress">0%</b></span>
          <span class="trace-pill">Tiempo <b id="traceTimer">60.0s</b></span>
        </div>
      </header>

      <div class="trace-layout">
        <div class="trace-stage-wrap lecturas-game-stage" id="traceStage">
          ${isCouple ? playerA + playerB : `
          <video id="traceCameraFeed" class="trace-camera-feed" autoplay playsinline muted></video>
          <canvas id="traceCanvas" width="960" height="540" aria-label="Lienzo de trazos"></canvas>
          `}
          <div class="trace-canvas-controls" id="traceCanvasControls">
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="start">Iniciar</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="reset">Reiniciar</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="next">Siguiente</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="menu">Menu</button>
          </div>
          <div class="trace-mobile-controls" id="traceMobileControls">
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="start">Iniciar</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="reset">Reiniciar</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="next">Siguiente</button>
            <button class="trace-touch-btn lecturas-game-pixel-btn is-short" data-action="menu">Menu</button>
          </div>
        </div>
      </div>

      <!-- Tutorial Modal -->
      <div id="traceIntroModal" class="trace-intro-modal" ${(state.mode === 'intro' && !state.tutorialSeen) ? '' : 'hidden'}>
        <div class="trace-modal-content">
          <div class="trace-modal-header">
            <div class="trace-modal-icon">👋</div>
            <h2>¡Hola! Vamos a aprender</h2>
          </div>
          <div class="trace-modal-body">
            <div class="trace-tutorial-grid">
              <div class="trace-tutorial-step">
                <div class="trace-step-num">1</div>
                <p>Usa tu dedo para seguir la <b>línea amarilla</b> hasta el final.</p>
              </div>
              <div class="trace-tutorial-step">
                <div class="trace-step-num">2</div>
                <p>Si te sales del camino o vas al revés, ¡tendrás que volver a empezar!</p>
              </div>
              <div class="trace-tutorial-step">
                <div class="trace-step-num">3</div>
                <p><b>Control por Cámara:</b> Junta tu dedo índice y pulgar para empezar a "escribir en el aire".</p>
                <img src="pinch_gesture_tutorial.png" alt="Gesto de pinza" class="trace-gesture-img">
              </div>
            </div>
          </div>
          <div class="trace-modal-footer">
            <button class="trace-touch-btn lecturas-game-pixel-btn is-gold" data-action="dismissTutorial">¡Entendido! Comenzar</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function wireUi(ui, state) {
  ui.buttons.forEach((btn) => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action || "", state, ui));
  });

  window.addEventListener("resize", () => {
    resizeCanvas(ui, state);
    syncRightRailLayout(ui);
  });
  setThemeClass(ui.root, state);
  syncRightRailLayout(ui);
  refreshHud(ui, state);
}

function setupInput(ui, state) {
  const onPointer = (event) => {
    const rect = ui.stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * state.view.width;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * state.view.height;
    state.pointer.targetX = clamp(x, 0, state.view.width);
    state.pointer.targetY = clamp(y, 0, state.view.height);
    state.pointer.source = "pointer";
  };

  ui.stage.addEventListener("pointerdown", onPointer);
  ui.stage.addEventListener("pointermove", onPointer);
}

function setupKeyboard(state) {
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") state.keyboard.left = true;
    if (event.key === "ArrowRight") state.keyboard.right = true;
    if (event.key === "ArrowUp") state.keyboard.up = true;
    if (event.key === "ArrowDown") state.keyboard.down = true;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      state.keyboard.active = true;
      state.pointer.source = "keyboard";
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") state.keyboard.left = false;
    if (event.key === "ArrowRight") state.keyboard.right = false;
    if (event.key === "ArrowUp") state.keyboard.up = false;
    if (event.key === "ArrowDown") state.keyboard.down = false;
  });
}

function resizeCanvas(ui, state) {
  const rect = ui.stage.getBoundingClientRect();
  const width = Math.round(rect.width || 960);
  const height = Math.round(rect.height || 540);
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  state.view.width = width;
  state.view.height = height;
  state.view.dpr = dpr;

  ui.canvas.width = Math.round(width * dpr);
  ui.canvas.height = Math.round(height * dpr);
  ui.canvas.style.width = `${width}px`;
  ui.canvas.style.height = `${height}px`;
  ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scale = Math.max(0.5, Math.min(width, height) / 600);
  state.pointer.radius = 18 * scale;

  rebuildCheckpoints(state);
}

function syncRightRailLayout(ui) {
  const shell = ui?.shell;
  const topbar = ui?.topbar;
  const controls = ui?.controls;
  if (!shell || !topbar || !controls) return;
  const topbarHeight = Math.max(0, Math.ceil(topbar.getBoundingClientRect().height || 0));
  shell.style.setProperty("--trace-topbar-height", `${topbarHeight}px`);
}

async function handleAction(action, state, ui) {
  if (!action) return;

  if (action === "dismissTutorial") {
    state.tutorialSeen = true;
    if (ui.introModal) ui.introModal.hidden = true;
    refreshHud(ui, state);
    return;
  }
  if (action === "start" || action === "reset" || action === "next") {
    triggerRocketShakeFx(state);
  }

  if (action === "start") {
    if (!state.camera.enabled) await enableCamera(state, ui);
    if (!state.camera.ready) {
      state.mode = "intro";
      state.textStatus = "Usa el mouse o touch para trazar.";
      refreshHud(ui, state);
      return;
    }
    beginCountdown(state);
  }

  if (action === "reset") {
    stopReadingMusic(state);
    resetTrace(state, false);
    state.mode = "intro";
    state.textStatus = "Trazo reiniciado";
  }

  if (action === "next") {
    stopReadingMusic(state);

    // Level up on each new letter
    state.level += 1;

    // Persist to Firebase
    void syncTraceScoresToFirebase(state, "next-letter");

    state.letterIndex = (state.letterIndex + 1) % state.letters.length;
    if (state.coupleMode) {
      state.secondaryLetterIndex = (state.secondaryLetterIndex + 1) % state.secondaryLetters.length;
    }
    if (state.wordPool.length) {
      const nextWordIdx = state.letterIndex % state.wordPool.length;
      state.currentWord = state.wordPool[nextWordIdx] || state.currentWord;
    }
    if (state.reading.images && state.reading.images.length > 0) {
      const imgIndex = state.letterIndex % state.reading.images.length;
      const newBgUrl = state.reading.images[imgIndex];
      if (newBgUrl) {
        state.readingBg.url = newBgUrl;
        const shell = ui.root.querySelector("#traceGameShell");
        if (shell) {
          shell.style.setProperty("--trace-reading-bg-image", `url("${escapeCssUrl(newBgUrl)}")`);
        }
      }
    }
    resetTrace(state, true);
    state.mode = "intro";
    state.textStatus = `¡Siguiente Nivel: ${state.level}! Nueva letra: ${state.letters[state.letterIndex]}`;
  }

  if (action === "theme") {
    state.themeIndex = (state.themeIndex + 1) % state.themes.length;
    setThemeClass(ui.root, state);
    state.textStatus = `Estilo: ${state.themes[state.themeIndex]}`;
  }

  if (action === "menu") {
    window.location.href = "./lecturasGame.html";
    return;
  }

  if (action === "camera") {
    if (state.camera.enabled) {
      stopCamera(state);
      state.textStatus = "Cámara desactivada. Usa mouse o touch.";
    } else {
      await enableCamera(state, ui);
      state.textStatus = state.camera.ready
        ? "Cámara activa. Toca la pantalla para trazar."
        : "Usa el mouse o touch para trazar.";
    }
  }

  if (action === "demo") {
    state.autoDemo = !state.autoDemo;
    state.mode = state.autoDemo ? "playing" : state.mode;
    if (state.autoDemo) {
      state.roundLeftMs = state.roundMs;
      state.textStatus = "Demo activo: el avatar sigue la ruta.";
      rebuildCheckpoints(state);
    } else {
      state.textStatus = "Demo desactivado.";
    }
  }

  refreshHud(ui, state);
}

async function enableCamera(state, ui) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 540 }
      },
      audio: false
    });

    state.camera.enabled = true;
    state.camera.ready = true;
    state.camera.error = "";
    state.camera.stream = stream;
    ui.video.srcObject = stream;

    await ui.video.play().catch(() => { });
    if (ui.status) ui.status.textContent = "Cámara activa";

    await ensureHandLandmarker(state);
  } catch (error) {
    state.camera.enabled = false;
    state.camera.ready = false;
    state.camera.error = String(error?.message || "camera_error");
    if (ui.status) ui.status.textContent = "Sin cámara (fallback touch/teclado)";
  }
}

function stopCamera(state) {
  const stream = state.camera.stream;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  state.camera.enabled = false;
  state.camera.ready = false;
  state.camera.stream = null;
}

async function ensureHandLandmarker(state) {
  if (state.camera.handLandmarker) return state.camera.handLandmarker;
  try {
    const vision = await import("./vendor/mediapipe/vision_bundle.mjs");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "./vendor/mediapipe/wasm"
    );
    const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
      },
      runningMode: "VIDEO",
      numHands: 1,
      minTrackingConfidence: 0.45,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45
    });

    state.camera.visionModule = vision;
    state.camera.handLandmarker = landmarker;
    state.camera.visionReady = true;
    return landmarker;
  } catch (_) {
    state.camera.visionReady = false;
    return null;
  }
}

async function updateCameraPose(state, ui, ts) {
  const landmarker = state.camera.handLandmarker;
  if (!state.camera.enabled || !state.camera.ready || !landmarker) return;
  if (!ui.video || ui.video.readyState < 2) return;

  try {
    const result = landmarker.detectForVideo(ui.video, ts);
    const hand = Array.isArray(result?.landmarks) ? result.landmarks[0] : null;
    if (!hand || !hand[8]) return;

    const tip = hand[8];
    const thumb = hand[4] || null;
    const cursorPoint = _traceHandStableCursorPoint(hand);
    const x = (1 - Number(cursorPoint.x || 0.5)) * state.view.width;
    const y = Number(cursorPoint.y || 0.5) * state.view.height;

    state.cameraHand.x = clamp(x, 0, state.view.width);
    state.cameraHand.y = clamp(y, 0, state.view.height);
    state.cameraHand.confidence = 1;
    if (thumb) {
      const pinchRaw = Math.hypot(Number(tip.x || 0) - Number(thumb.x || 0), Number(tip.y || 0) - Number(thumb.y || 0));
      state.cameraHand.pinchDistanceNorm = pinchRaw;
      state.traceFlow.pinchStrength = clamp((0.14 - pinchRaw) / 0.14, 0, 1);
      state.traceFlow.pinchActive = state.traceFlow.pinchStrength > 0.38;
    } else {
      state.cameraHand.pinchDistanceNorm = 1;
      state.traceFlow.pinchStrength = 0;
      state.traceFlow.pinchActive = false;
    }

    state.pointer.targetX = state.cameraHand.x;
    state.pointer.targetY = state.cameraHand.y;
    state.pointer.source = "camera";
  } catch (_) {
    // keep fallback controls
  }
}

function _traceHandStableCursorPoint(hand = null) {
  if (!Array.isArray(hand) || !hand.length) return { x: 0.5, y: 0.5 };
  const safe = (idx = 0) => hand[idx] || { x: 0.5, y: 0.5 };
  const wrist = safe(0);
  const thumbCmc = safe(1);
  const thumbMcp = safe(2);
  const thumbIp = safe(3);
  const thumbTip = safe(4);
  // Anchor cursor to thumb chain so index finger movement does not drag the cursor.
  const x = (
    Number(thumbTip.x || 0.5) * 0.46 +
    Number(thumbIp.x || 0.5) * 0.24 +
    Number(thumbMcp.x || 0.5) * 0.18 +
    Number(thumbCmc.x || 0.5) * 0.08 +
    Number(wrist.x || 0.5) * 0.04
  );
  const y = (
    Number(thumbTip.y || 0.5) * 0.46 +
    Number(thumbIp.y || 0.5) * 0.24 +
    Number(thumbMcp.y || 0.5) * 0.18 +
    Number(thumbCmc.y || 0.5) * 0.08 +
    Number(wrist.y || 0.5) * 0.04
  );
  return { x, y };
}

function updateGame(state, ui, dt, now) {
  updatePointerPhysics(state, dt);
  updateShakeFx(state, ui, dt);
  updateCountdown(state, now);

  if (state.keyboard.active && state.pointer.source === "keyboard") {
    const keyboardSpeed = dt * 0.38;
    if (state.keyboard.left) state.pointer.x -= keyboardSpeed;
    if (state.keyboard.right) state.pointer.x += keyboardSpeed;
    if (state.keyboard.up) state.pointer.y -= keyboardSpeed;
    if (state.keyboard.down) state.pointer.y += keyboardSpeed;
    state.pointer.x = clamp(state.pointer.x, 0, state.view.width);
    state.pointer.y = clamp(state.pointer.y, 0, state.view.height);
    state.pointer.targetX = state.pointer.x;
    state.pointer.targetY = state.pointer.y;
  }

  if (state.autoDemo && state.mode === "playing") {
    autoDrivePointer(state, dt);
  }

  if (state.mode === "playing") {
    state.roundLeftMs = Math.max(0, state.roundLeftMs - dt);
    if (state.roundLeftMs <= 0) {
      state.mode = "timeout";
      state.combo = 0;
      state.textStatus = "Se acabó el tiempo. Reinicia para intentar de nuevo.";
      triggerMistakeFeedback(state);
    }

    updateTraceProgress(state, dt, now);
    updateBonusTokens(state, dt, now);
  }

  updateParticles(state, dt);
  updateDwellButtons(state, ui, dt, now);

  refreshHud(ui, state);
}

function updatePointerPhysics(state, dt) {
  const pointer = state.pointer;
  const accel = pointer.source === "camera" ? 0.36 : 0.28;
  const maxStep = pointer.source === "camera" ? 34 : 32;
  // Much higher smoothing to remove 'shake'
  const smoothing = 0.12;
  pointer.velocityX = (pointer.targetX - pointer.x) * smoothing;
  pointer.velocityY = (pointer.targetY - pointer.y) * smoothing;
  pointer.x = clamp(pointer.x + pointer.velocityX, 0, state.view.width);
  pointer.y = clamp(pointer.y + pointer.velocityY, 0, state.view.height);
}

function updateTraceProgress(state, dt, now) {
  const checkpoints = state.checkpoints;
  if (!checkpoints.length) return;

  const pointer = state.pointer;
  const flow = state.traceFlow;
  const current = checkpoints[Math.min(flow.checkpointIndex, checkpoints.length - 1)];
  const nearest = nearestDistanceToPath(pointer.x, pointer.y, checkpoints);
  const traceGestureActive = state.autoDemo
    ? true
    : (flow.requiresPinch ? (flow.pinchActive && state.pointer.source === "camera") : true);

  const currentStrokeStart = checkpoints.find((point) => point.strokeStart && point.stroke === flow.strokeIndex) || checkpoints[0];
  if (!state.traceActive) {
    if (!traceGestureActive) return;
    const startDist = dist(pointer.x, pointer.y, currentStrokeStart.x, currentStrokeStart.y);
    // Starts broad (72) and gets tighter (30) with level
    const startRadius = Math.max(30, 72 - (state.level - 1) * 3.5);
    if (startDist <= startRadius) {
      state.traceActive = true;
      state.playerTrail = [{ x: pointer.x, y: pointer.y }];
      flow.strokeStartConfirmed = true;
      burstParticles(state, pointer.x, pointer.y, "#8bf7ff", 12);
      startSustainedTraceSound(state);
      void startReadingMusic(state);
      state.textStatus = "Trazo activo. Sigue la dirección.";
    }
    return;
  }

  if (!traceGestureActive) {
    if (state.traceActive) {
      state.traceActive = false;
      stopSustainedTraceSound(state);
      pauseReadingMusic(state);
    }
    flow.strokeStartConfirmed = false;
    flow.offTrackMs = 0;
    state.textStatus = "Levanta el dedo y toca para volver a dibujar.";
    return;
  }

  const grade = getGradeWeight(state);
  const isMobile = Math.min(state.view.width, state.view.height) < 600;
  const scale = Math.max(0.5, Math.min(state.view.width, state.view.height) / 600);

  // Grade 1: Thickest (90+), Grade 6: Thinnest (~26)
  const gradeStart = isMobile
    ? (96 - (grade - 1) * 13)
    : (72 - (grade - 1) * 10);

  const thicknessBase = Math.max(isMobile ? 12 : 10, gradeStart - (state.level - 1) * 1.5);
  // letterRadius is the "inner" threshold. 
  // We add a Grade-based multiplier to be more 'permissive' in lower grades.
  // Grade 1 gets a huge 2.5x multiplier, while Grade 6 is strict 1.0x.
  const toleranceMult = Math.max(1.0, 2.5 - (grade - 1) * 0.3);
  const letterRadius = (thicknessBase * scale * 0.5) * toleranceMult;

  // Strict check: if pointer is outside the letter thickness, it's a mistake
  if (nearest > letterRadius) {
    flow.offTrackMs += dt;
    const gracePeriod = Math.max(250, 600 - (grade - 1) * 80);
    if (flow.offTrackMs > gracePeriod) {
      state.traceActive = false;
      stopSustainedTraceSound(state);
      flow.offTrackMs = 0;
      flow.checkpointIndex = 0;
      flow.strokeIndex = 0;
      flow.strokeStartConfirmed = false;
      state.playerTrail = [];
      state.progress = 0;
      state.combo = 0;
      state.textStatus = "¡Te saliste! Vuelve a empezar desde el inicio.";
      burstParticles(state, pointer.x, pointer.y, "#ff7c8e", 24);
      stopReadingMusic(state);
      triggerMistakeFeedback(state);
      // Restart music after feedback
      setTimeout(() => {
        if (state.mode === "playing") void startReadingMusic(state);
      }, 450);
    }
    return;
  }

  flow.offTrackMs = 0;

  const expectedDx = Number(current.vx || 0);
  const expectedDy = Number(current.vy || 0);
  const movementDx = Number(pointer.velocityX || 0);
  const movementDy = Number(pointer.velocityY || 0);
  const movementNorm = Math.hypot(movementDx, movementDy);
  const expectedNorm = Math.hypot(expectedDx, expectedDy);
  let directionScore = 1;
  if (movementNorm > 0.1 && expectedNorm > 0.1) {
    directionScore = ((movementDx * expectedDx) + (movementDy * expectedDy)) / (movementNorm * expectedNorm);
  }

  // Direction scoring gets stricter
  const directionThreshold = Math.max(-0.2, -0.6 + (state.level - 1) * 0.04);
  if (directionScore < directionThreshold) {
    flow.wrongDirectionMs += dt;
    const maxWrongDirMs = Math.max(250, 1000 - (state.level - 1) * 60);
    if (flow.wrongDirectionMs > maxWrongDirMs) {
      state.combo = 0;
      state.traceActive = false;
      stopSustainedTraceSound(state);
      flow.strokeStartConfirmed = false;
      flow.checkpointIndex = 0;
      flow.strokeIndex = 0;
      state.playerTrail = [];
      state.progress = 0;
      state.textStatus = "Dirección incorrecta. Vuelve al inicio.";
      burstParticles(state, pointer.x, pointer.y, "#ff9f4a", 12);
      stopReadingMusic(state);
      triggerMistakeFeedback(state);
      // Restart music after feedback
      setTimeout(() => {
        if (state.mode === "playing") void startReadingMusic(state);
      }, 450);
      return;
    }
  } else {
    flow.wrongDirectionMs = Math.max(0, flow.wrongDirectionMs - dt * 0.8);
  }

  // Checkpoint capture radius: reduced so the yellow guide doesn't jump too far ahead
  // We use a much smaller radius (12px) for the last point of a stroke to force completion
  const isLastOfStroke = current.strokeEnd || (checkpoints[flow.checkpointIndex + 1] && checkpoints[flow.checkpointIndex + 1].stroke > current.stroke);
  const baseRadius = Math.max(24, 42 - (state.level - 1) * 2.2);
  const checkpointCaptureRadius = isLastOfStroke ? 12 : baseRadius;

  if (dist(pointer.x, pointer.y, current.x, current.y) <= checkpointCaptureRadius) {
    flow.checkpointIndex = Math.min(checkpoints.length - 1, flow.checkpointIndex + 1);
    const next = checkpoints[Math.min(checkpoints.length - 1, flow.checkpointIndex)];
    if (next.stroke > flow.strokeIndex) {
      flow.strokeIndex = next.stroke;
      flow.strokeStartConfirmed = false;
      state.traceActive = false;
      stopSustainedTraceSound(state);
      pauseReadingMusic(state);
      state.textStatus = `Buen trazo. Inicia el siguiente segmento ${flow.strokeIndex + 1}.`;
    }
  }

  const last = state.playerTrail[state.playerTrail.length - 1];
  if (!last || dist(last.x, last.y, pointer.x, pointer.y) > 3) {
    // Basic smoothing for the trail itself
    const newX = last ? lerp(last.x, pointer.x, 0.8) : pointer.x;
    const newY = last ? lerp(last.y, pointer.y, 0.8) : pointer.y;
    state.playerTrail.push({ x: newX, y: newY, t: now });
    if (state.playerTrail.length > 1000) state.playerTrail.shift();
    if (state.traceActive) {
      // Removed repeated sound pulses
    }
  }

  state.progress = flow.checkpointIndex / Math.max(1, checkpoints.length - 1);

  if (state.progress >= 0.995) {
    onLetterCompleted(state, pointer.x, pointer.y);
  }
}

function updateBonusTokens(state, dt, now) {
  if (now - state.lastTokenSpawnMs > 2100 && state.mode === "playing") {
    state.lastTokenSpawnMs = now;
    const idx = Math.floor(Math.random() * Math.max(1, state.checkpoints.length));
    const base = state.checkpoints[idx] || { x: state.view.width * 0.5, y: state.view.height * 0.5 };
    const tokenText = state.wordPool.length
      ? state.wordPool[Math.floor(Math.random() * state.wordPool.length)]
      : "";
    const tokenW = tokenText ? Math.max(58, tokenText.length * 14) : 0;
    state.tokens.push({
      x: base.x + (Math.random() * 60 - 30),
      y: base.y + (Math.random() * 60 - 30),
      r: 10 + Math.random() * 6,
      text: tokenText,
      w: tokenW,
      h: tokenText ? 30 : 0,
      life: 2400
    });
  }

  for (let i = state.tokens.length - 1; i >= 0; i -= 1) {
    const token = state.tokens[i];
    token.life -= dt;
    if (token.life <= 0) {
      state.tokens.splice(i, 1);
      continue;
    }

    const hit = token.text
      ? circleRectHit(state.pointer.x, state.pointer.y, state.pointer.radius, token.x - token.w / 2, token.y - token.h / 2, token.w, token.h)
      : (dist(state.pointer.x, state.pointer.y, token.x, token.y) < token.r + state.pointer.radius - 4);
    if (hit) {
      state.tokens.splice(i, 1);
      state.score += token.text ? 22 : 15;
      if (token.text) state.currentWord = token.text;
      burstParticles(state, token.x, token.y, "#ffe06f", 14);
    }
  }
}

function onLetterCompleted(state, x, y) {
  state.mode = "completed";
  state.traceActive = false;
  state.streak += 1;
  state.combo += 1;
  const basePoints = 120;
  const comboBonus = Math.min(80, state.combo * 10);
  const timeBonus = Math.floor(state.roundLeftMs / 100);
  state.score += basePoints + comboBonus + timeBonus;

  const accuracy = Math.min(100, Math.floor(85 + (state.roundLeftMs / state.roundMs) * 15));
  const grade = accuracy >= 90 ? "A" : accuracy >= 80 ? "B" : accuracy >= 70 ? "C" : accuracy >= 60 ? "D" : "F";

  state.textStatus = `¡Excelente! Letra ${state.letters[state.letterIndex]} - Puntos: ${basePoints + comboBonus + timeBonus}`;
  burstParticles(state, x, y, "#a4ff6a", 34);

  stopSustainedTraceSound(state);
  // Persist scores when completed
  void syncTraceScoresToFirebase(state, "level-clear");
}

function resetTrace(state, hardReset) {
  state.roundLeftMs = state.roundMs;
  state.progress = 0;
  state.traceFlow.checkpointIndex = 0;
  state.traceFlow.strokeIndex = 0;
  state.traceFlow.strokeStartConfirmed = false;
  state.traceFlow.offTrackMs = 0;
  state.traceFlow.wrongDirectionMs = 0;
  state.traceActive = false;
  state.playerTrail = [];
  state.tokens = [];
  if (hardReset) {
    state.combo = 0;
  }
  rebuildCheckpoints(state);
}

function rebuildCheckpoints(state) {
  const word = String(state.letters[state.letterIndex] || "A");
  const width = state.view.width;
  const height = state.view.height;
  const isMobile = Math.min(width, height) < 600;

  const baseSize = Math.min(width, height);
  const totalAreaWidth = isMobile ? baseSize * 0.72 : baseSize * 0.64;
  const totalAreaHeight = totalAreaWidth * 0.75;

  const out = [];
  const chars = [...word];
  const charSpacing = 0.05; // Gap between chars
  const charTotalWidth = (1 / chars.length) - (charSpacing * (chars.length - 1) / chars.length);

  const totalWordScale = chars.length > 3 ? (3 / chars.length) : 1;
  const finalLetterWidth = totalAreaWidth * totalWordScale;
  const finalLetterHeight = finalLetterWidth * 0.8;

  const offsetX = (width - finalLetterWidth) / 2;
  const offsetY = (height - finalLetterHeight) / 2;

  chars.forEach((char, charIdx) => {
    const strokes = LETTER_STROKES[char] || LETTER_STROKES["A"];
    const charXOffset = (charIdx / chars.length) * finalLetterWidth;
    const charWidthScale = (1 / chars.length) * finalLetterWidth * 0.9;

    strokes.forEach((polyline, strokeIndex) => {
      let firstPointWritten = false;
      for (let i = 0; i < polyline.length - 1; i += 1) {
        const a = polyline[i];
        const b = polyline[i + 1];

        const ax = offsetX + charXOffset + a[0] * charWidthScale;
        const ay = offsetY + a[1] * finalLetterHeight;
        const bx = offsetX + charXOffset + b[0] * charWidthScale;
        const by = offsetY + b[1] * finalLetterHeight;

        const segmentLen = Math.max(1, Math.hypot(bx - ax, by - ay));
        const steps = Math.max(1, Math.ceil(segmentLen / 8));

        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          out.push({
            x: lerp(ax, bx, t),
            y: lerp(ay, by, t),
            vx: bx - ax,
            vy: by - ay,
            stroke: (charIdx * 10) + strokeIndex, // Unique stroke ID across chars
            strokeStart: !firstPointWritten && step === 0,
            strokeEnd: i === polyline.length - 2 && step === steps
          });
          if (!firstPointWritten && step === 0) firstPointWritten = true;
        }
      }
    });
  });

  state.checkpoints = out;
  if (!out.length) {
    console.warn("[Trace] rebuildCheckpoints failed to generate points for:", word);
  }
}

function updateDwellButtons(state, ui, dt, now) {
  if (!ui.buttons.length) return;

  let hoveredAction = "";
  const avatar = {
    x: state.pointer.x,
    y: state.pointer.y,
    r: state.pointer.radius
  };

  ui.buttons.forEach((btn) => {
    btn.classList.remove("is-avatar-hover");
    btn.style.removeProperty("--trace-dwell");
  });

  const shellRect = ui.root.querySelector("#traceGameShell")?.getBoundingClientRect() || ui.stage.getBoundingClientRect();
  for (const btn of ui.buttons) {
    if (btn.hidden || btn.disabled) continue;
    const rect = btn.getBoundingClientRect();
    const stageRect = ui.stage.getBoundingClientRect();
    const inStage = !!btn.closest("#traceStage");
    const nx = avatar.x / Math.max(1, state.view.width);
    const ny = avatar.y / Math.max(1, state.view.height);
    const x = (state.pointer.source === "camera" && !inStage)
      ? (shellRect.left + nx * shellRect.width)
      : (stageRect.left + nx * stageRect.width);
    const y = (state.pointer.source === "camera" && !inStage)
      ? (shellRect.top + ny * shellRect.height)
      : (stageRect.top + ny * stageRect.height);
    const nearestX = clamp(x, rect.left, rect.right);
    const nearestY = clamp(y, rect.top, rect.bottom);
    const hit = Math.hypot(x - nearestX, y - nearestY) <= avatar.r * 0.78;
    if (hit) {
      hoveredAction = btn.dataset.action || "";
      btn.classList.add("is-avatar-hover");
      break;
    }
  }

  const dwell = state.dwell;
  const gestureClick = state.gestureClick || { lastClosed: false, cooldownUntilMs: 0 };
  const usingCamera = state.pointer.source === "camera";
  const handClosed = usingCamera && state.traceFlow.pinchActive === true;

  if (usingCamera) {
    const button = hoveredAction
      ? ui.buttons.find((item) => item.dataset.action === hoveredAction)
      : null;
    // Click with gesture only when the hand closes (rising edge).
    if (button && handClosed && !gestureClick.lastClosed && now >= Number(gestureClick.cooldownUntilMs || 0)) {
      gestureClick.cooldownUntilMs = now + 520;
      button.click();
    }
    gestureClick.lastClosed = handClosed;
    state.gestureClick = gestureClick;
    dwell.targetAction = "";
    dwell.elapsed = 0;
    return;
  }

  if (!hoveredAction || now < dwell.cooldownUntilMs) {
    dwell.targetAction = "";
    dwell.elapsed = 0;
    return;
  }

  if (dwell.targetAction !== hoveredAction) {
    dwell.targetAction = hoveredAction;
    dwell.elapsed = 0;
  } else {
    dwell.elapsed += dt;
  }

  const button = ui.buttons.find((item) => item.dataset.action === dwell.targetAction);
  if (button) {
    button.style.setProperty("--trace-dwell", String(clamp(dwell.elapsed / dwell.thresholdMs, 0, 1)));
  }

  if (dwell.elapsed >= dwell.thresholdMs && button) {
    dwell.cooldownUntilMs = now + 620;
    dwell.elapsed = 0;
    dwell.targetAction = "";
    button.click();
  }
}

function autoDrivePointer(state) {
  const checkpoints = state.checkpoints;
  if (!checkpoints.length) return;
  const idx = clamp(state.traceFlow.checkpointIndex + 2, 0, checkpoints.length - 1);
  const target = checkpoints[idx];
  state.pointer.targetX = target.x;
  state.pointer.targetY = target.y;
  state.pointer.source = "demo";
}

function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * (dt / 16);
    p.y += p.vy * (dt / 16);
    p.vy += 0.08 * (dt / 16);
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function burstParticles(state, x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3.5;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 420 + Math.random() * 350,
      color
    });
  }
}

function render(state, ui) {
  const { ctx } = ui;
  const w = state.view.width;
  const h = state.view.height;

  ctx.clearRect(0, 0, w, h);

  if (state.mode === "intro") {
    drawBackdrop(ctx, w, h, state);
    drawTraceGuide(ctx, state);
    drawAvatar(ctx, state);
    return;
  }

  drawBackdrop(ctx, w, h, state);
  drawTraceGuide(ctx, state);
  drawPlayerTrail(ctx, state);
  drawTokens(ctx, state);
  drawAvatar(ctx, state);
  drawParticles(ctx, state);
  drawCountdownOverlay(ctx, w, h, state);

  if (state.mode === "completed") {
    drawBanner(ctx, w, h, "¡Letra completada!", "Toca Siguiente letra o reinicia para mejorar tu combo");
  } else if (state.mode === "timeout") {
    drawBanner(ctx, w, h, "Tiempo agotado", "Toca Reiniciar trazo para volver a intentar");
  }
}

function drawBackdrop(ctx, w, h, state) {
  void ctx;
  void w;
  void h;
  void state;
}

function loadReadingBackground(state, root) {
  const url = String(state?.readingBg?.url || "").trim() || resolveReadingBackgroundUrl();
  if (!url) return;
  state.readingBg.url = url;
  const shell = root.querySelector("#traceGameShell");
  if (shell) shell.style.setProperty("--trace-reading-bg-image", `url(\"${escapeCssUrl(url)}\")`);
  const img = new Image();
  // Deliberately avoid crossOrigin so cross-site images can still render on canvas
  // (canvas becomes tainted, which is acceptable for this game flow).
  img.onload = () => {
    state.readingBg.image = img;
    state.readingBg.ready = true;
  };
  img.onerror = () => {
    state.readingBg.image = null;
    state.readingBg.ready = false;
  };
  img.src = url;
}

function resolveReadingBackgroundUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = String(
      params.get("readingImage")
      || params.get("readingBg")
      || params.get("bg")
      || params.get("image")
      || ""
    ).trim();
    if (fromQuery) return fromQuery;
  } catch (_) {
    // no-op
  }
  return "./logoCharly2.png";
}

function escapeCssUrl(value = "") {
  return String(value).replace(/["\\]/g, "\\$&");
}

function drawTraceGuide(ctx, state) {
  const checkpoints = state.checkpoints;
  if (!checkpoints.length) return;
  const flow = state.traceFlow;

  ctx.save();
  const w = state.view.width;
  const h = state.view.height;
  const minDim = Math.min(w, h);
  const scale = Math.max(0.5, minDim / 600);
  const isMobile = minDim < 600;
  // Thickness based on Grade + Level
  const grade = getGradeWeight(state);
  const gradeStart = isMobile
    ? (96 - (grade - 1) * 13)
    : (72 - (grade - 1) * 10);
  const lineWidthBase = Math.max(isMobile ? 12 : 10, gradeStart - (state.level - 1) * 1.5);
  const scaleThin = scale * 0.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = lineWidthBase * scale;
  ctx.beginPath();
  checkpoints.forEach((point, idx) => {
    if (idx === 0 || point.strokeStart) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  ctx.setLineDash([6 * scale, 6 * scale]);
  ctx.strokeStyle = "rgba(65, 227, 255, 0.92)";
  ctx.lineWidth = 4 * scale;
  ctx.stroke();
  ctx.setLineDash([]);

  const activeStart = checkpoints[Math.min(flow.checkpointIndex, checkpoints.length - 1)] || checkpoints[0];
  const activeStroke = Number(activeStart.stroke || 0);
  const activeStrokePoints = checkpoints.filter((point) => Number(point.stroke || 0) === activeStroke);
  if (activeStrokePoints.length > 1) {
    ctx.strokeStyle = "rgba(255, 241, 120, 0.9)";
    ctx.lineWidth = isMobile ? 12 * scale : 10 * scale;
    ctx.beginPath();
    activeStrokePoints.forEach((point, idx) => {
      if (idx === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  for (let i = 14; i < checkpoints.length; i += 24) {
    const p = checkpoints[i];
    if (!p) continue;
    const vx = Number(p.vx || 0);
    const vy = Number(p.vy || 0);
    const n = Math.max(0.0001, Math.hypot(vx, vy));
    const ux = vx / n;
    const uy = vy / n;
    const arrowScale = isMobile ? 1.2 : 0.8;
    const arrowLen = 10 * scale * arrowScale;
    const arrowW = 5 * scale * arrowScale;
    const baseX = p.x - ux * arrowLen;
    const baseY = p.y - uy * arrowLen;
    const tipX = p.x + ux * arrowLen;
    const tipY = p.y + uy * arrowLen;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + (-uy) * arrowW, baseY + ux * arrowW);
    ctx.lineTo(baseX - (-uy) * arrowW, baseY - ux * arrowW);
    ctx.closePath();
    ctx.fill();
  }

  const start = checkpoints[0];
  const end = checkpoints[checkpoints.length - 1];
  const nodeRadius = scale < 0.8 ? 18 * scale : 14 * scale;

  const drawCircle = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  drawCircle(start.x, start.y, nodeRadius, "#7ef8a2");
  drawCircle(end.x, end.y, nodeRadius, "#ffd46f");

  ctx.restore();
}

function drawPlayerTrail(ctx, state) {
  const trail = state.playerTrail;
  if (trail.length < 2) return;

  ctx.save();
  const scale = Math.max(0.5, Math.min(state.view.width, state.view.height) / 600);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a.miss || b.miss) continue;
    const alpha = clamp((i / trail.length) * 0.95, 0.2, 0.95);
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    // Trail thickness also slightly scales with level to not look weird on thin letters
    const trailWidth = Math.max(6, 11 - (state.level - 1) * 0.4);
    ctx.lineWidth = trailWidth * scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTokens(ctx, state) {
  state.tokens.forEach((token) => {
    const pulse = 0.65 + Math.sin(token.life * 0.02) * 0.22;
    if (token.text) {
      const w = Number(token.w || 60);
      const h = Number(token.h || 28);
      const x = token.x - w / 2;
      const y = token.y - h / 2;
      ctx.save();
      ctx.globalAlpha = pulse;
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = "rgba(255, 237, 120, 0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(76, 52, 22, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#1f1b11";
      ctx.font = "900 14px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(token.text || "").slice(0, 16), token.x, token.y + 0.5);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ffe36d";
    ctx.beginPath();
    ctx.arc(token.x, token.y, token.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawAvatar(ctx, state) {
  const { x, y, radius, source } = state.pointer;
  const pinchActive = state.traceFlow.pinchActive;
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 4, x, y, radius + 10);
  grad.addColorStop(0, pinchActive ? "rgba(255,255,185,0.98)" : "rgba(255,255,255,0.95)");
  grad.addColorStop(1, source === "camera" ? "rgba(80,255,196,0.2)" : "rgba(132,194,255,0.2)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pinchActive ? "#ffe770" : (source === "camera" ? "#53ffd2" : "#9ec0ff");
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
  ctx.stroke();

  if (pinchActive) {
    ctx.strokeStyle = "rgba(255, 221, 102, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, state) {
  state.particles.forEach((p) => {
    const alpha = clamp(p.life / 760, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBanner(ctx, w, h, title, subtitle) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 17, 38, 0.62)";
  ctx.fillRect(0, 0, w, h);

  const cardW = Math.min(560, w - 80);
  const cardH = 150;
  const x = (w - cardW) * 0.5;
  const y = (h - cardH) * 0.5;

  roundRect(ctx, x, y, cardW, cardH, 22);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();

  ctx.fillStyle = "#122047";
  ctx.font = "800 34px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, w * 0.5, y + 58);

  ctx.fillStyle = "#324879";
  ctx.font = "700 20px Nunito, sans-serif";
  ctx.fillText(subtitle, w * 0.5, y + 100);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function refreshHud(ui, state) {
  if (ui.status) ui.status.textContent = state.textStatus;
  if (ui.letter) ui.letter.textContent = state.letters[state.letterIndex] || "-";
  if (ui.level) ui.level.textContent = state.level;
  if (ui.score) ui.score.textContent = Math.round(state.score);
  if (ui.progress) ui.progress.textContent = `${Math.round(state.progress * 100)}%`;
  ui.timer.textContent = `${(state.roundLeftMs / 1000).toFixed(1)}s`;
  if (ui.currentWord) ui.currentWord.textContent = String(state.currentWord || "PALABRA");
  ui.hint.textContent = state.textStatus;
  ui.mode.textContent = modeLabel(state.mode, state);
  if (ui.status) {
    ui.status.textContent = state.camera.enabled
      ? (state.camera.visionReady
        ? "Trazando..."
        : "Cámara activa")
      : "Toca o haz clic para trazar";
  }

  if (ui.introModal) {
    ui.introModal.hidden = (state.mode !== "intro" || state.tutorialSeen);
  }
}

function modeLabel(mode, state) {
  if (mode === "intro") return "Intro";
  if (mode === "countdown") return "Cuenta";
  if (mode === "playing") return state.traceFlow.requiresPinch ? "Air Ink" : "Jugando";
  if (mode === "completed") return "Completada";
  if (mode === "timeout") return "Tiempo";
  return "Pausa";
}

function beginCountdown(state) {
  const now = performance.now();
  resetTrace(state, false);
  state.mode = "countdown";
  state.countdown.active = true;
  state.countdown.endAt = now + state.countdown.durationMs + Math.max(120, Number(state.countdown.goHoldMs || 0));
  state.roundLeftMs = state.roundMs;
  state.textStatus = "Prepara la mano: 3, 2, 1...";
}

function updateCountdown(state, now = performance.now()) {
  if (state.mode !== "countdown" || state.countdown.active !== true) return;
  if (now < Number(state.countdown.endAt || 0)) return;
  state.countdown.active = false;
  activatePlayingState(state);
}

function activatePlayingState(state) {
  state.mode = "playing";
  state.roundLeftMs = state.roundMs;
  state.startedAt = performance.now();
  state.traceActive = false;
  state.playerTrail = [];
  state.progress = 0;
  state.traceFlow.checkpointIndex = 0;
  state.traceFlow.strokeIndex = 0;
  state.traceFlow.strokeStartConfirmed = false;
  state.traceFlow.offTrackMs = 0;
  state.traceFlow.wrongDirectionMs = 0;
  state.textStatus = `Go! Traza la letra y captura: ${state.currentWord || "OBJETIVO"}`;
  rebuildCheckpoints(state);
}

function drawCountdownOverlay(ctx, w, h, state) {
  if (state.mode !== "countdown" || state.countdown.active !== true) return;
  const now = performance.now();
  const leftMs = Math.max(0, Number(state.countdown.endAt || 0) - now);
  const goHoldMs = Math.max(120, Number(state.countdown.goHoldMs || 0));
  const stage3 = goHoldMs + 2000;
  const stage2 = goHoldMs + 1000;
  let label = "Go!";
  if (leftMs > stage3) label = "3";
  else if (leftMs > stage2) label = "2";
  else if (leftMs > goHoldMs) label = "1";
  const pulse = 1 + ((Math.sin(now * 0.015) + 1) * 0.06);
  ctx.save();
  ctx.fillStyle = "rgba(12, 16, 32, 0.3)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(56, Math.round(Math.min(w, h) * 0.22 * pulse))}px Nunito, sans-serif`;
  ctx.strokeStyle = "rgba(17, 27, 14, 0.9)";
  ctx.lineWidth = 8;
  ctx.fillStyle = label === "Go!" ? "#94ff80" : "#fff5ad";
  ctx.strokeText(label, w * 0.5, h * 0.5);
  ctx.fillText(label, w * 0.5, h * 0.5);
  ctx.restore();
}

function triggerMistakeFeedback(state) {
  const now = performance.now();
  if ((now - Number(state.fx.lastMistakeAt || 0)) < 260) return;
  state.fx.lastMistakeAt = now;
  triggerRocketShakeFx(state);
}

function triggerRocketShakeFx(state) {
  const now = performance.now();
  if ((now - Number(state.fx.lastRocketAt || 0)) < 160) return;
  state.fx.lastRocketAt = now;
  startShakeFx(state, { amplitude: 18, durationMs: 440 });
  playRocketFx(state);
}

function startShakeFx(state, options = {}) {
  state.fx.shake.active = true;
  state.fx.shake.elapsedMs = 0;
  state.fx.shake.durationMs = Math.max(200, Number(options.durationMs || 420));
  state.fx.shake.amplitude = Math.max(8, Number(options.amplitude || 16));
  state.fx.shake.frequencyX = Math.max(0.05, Number(options.frequencyX || 0.123));
  state.fx.shake.frequencyY = Math.max(0.05, Number(options.frequencyY || 0.161));
}

function updateShakeFx(state, ui, dt) {
  const shake = state.fx.shake;
  if (!shake.active) {
    applyShakeVars(ui, 0, 0, 1);
    return;
  }
  shake.elapsedMs += Math.max(1, Number(dt || 16));
  const progress = Math.max(0, Math.min(1, shake.elapsedMs / Math.max(1, shake.durationMs)));
  const decay = Math.pow(1 - progress, 1.75);
  const amp = Number(shake.amplitude || 0) * decay;
  const x = Math.sin(shake.elapsedMs * Number(shake.frequencyX || 0.123)) * amp;
  const y = Math.cos(shake.elapsedMs * Number(shake.frequencyY || 0.161)) * (amp * 0.9);
  const scale = 1 + (0.0075 * decay);
  applyShakeVars(ui, x, y, scale);
  if (shake.elapsedMs >= shake.durationMs) {
    shake.active = false;
  }
}

function applyShakeVars(ui, x = 0, y = 0, scale = 1) {
  const stage = ui?.stage;
  if (!stage?.style) return;
  stage.style.setProperty("--trace-shake-x", `${Number(x || 0).toFixed(2)}px`);
  stage.style.setProperty("--trace-shake-y", `${Number(y || 0).toFixed(2)}px`);
  stage.style.setProperty("--trace-shake-scale", `${Number(scale || 1).toFixed(4)}`);
}

function startSustainedTraceSound(state) {
  try {
    if (!state.audio.ctx) state.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio.ctx;
    const loop = state.audio.traceLoop;

    if (loop.active) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Sustained high-tech beam sound
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);

    loop.osc = osc;
    loop.gain = gain;
    loop.active = true;
  } catch (e) {
    console.warn("[Trace] Sound start failed", e);
  }
}

function stopSustainedTraceSound(state) {
  try {
    const loop = state.audio.traceLoop;
    if (!loop.active || !loop.osc || !state.audio.ctx) return;

    const ctx = state.audio.ctx;
    const now = ctx.currentTime;

    // Smooth release
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
    loop.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    const osc = loop.osc;
    setTimeout(() => {
      try { osc.stop(); } catch (_) { }
    }, 100);

    loop.active = false;
    loop.osc = null;
    loop.gain = null;
  } catch (e) {
    console.warn("[Trace] Sound stop failed", e);
  }
}

function playTraceSound(state) {
  // Legacy alias if needed, but we use sustained methods now
  startSustainedTraceSound(state);
}

function playRocketFx(state) {
  try {
    if (!state.audio.ctx) state.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.22);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch (_) { }
}

function resolveTraceGameMusicUrl(state) {
  const assets = state?.reading?.musicAssets || {};
  const candidate = String(assets.gameUrl || assets.juegoUrl || assets.readingUrl || assets.lecturaUrl || "").trim()
    || String(assets.gamePath || assets.juegoPath || assets.readingPath || assets.lecturaPath || "").trim();
  if (!candidate) return "";
  if (/^(https?:|blob:|data:|\/)/i.test(candidate)) return candidate;
  if (/^gs:\/\//i.test(candidate)) {
    const parsed = parseGsUrl(candidate);
    if (!parsed.path) return "";
    const bucket = parsed.bucket || assets.bucket || TRACE_DEFAULT_STORAGE_BUCKET;
    return buildFirebaseAltMediaUrl(bucket, parsed.path);
  }
  return buildFirebaseAltMediaUrl(String(assets.bucket || TRACE_DEFAULT_STORAGE_BUCKET), candidate);
}

function parseGsUrl(value = "") {
  const clean = String(value || "").trim();
  const m = clean.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (!m) return { bucket: "", path: "" };
  return { bucket: String(m[1] || "").trim(), path: String(m[2] || "").trim() };
}

function buildFirebaseAltMediaUrl(bucket = "", path = "") {
  const b = String(bucket || TRACE_DEFAULT_STORAGE_BUCKET).trim();
  const p = String(path || "").replace(/^\/+/, "");
  if (!p) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(b)}/o/${encodeURIComponent(p)}?alt=media`;
}

function ensureReadingMusicAudio(state) {
  const music = state.audio.music;
  if (!(music.audioEl instanceof HTMLAudioElement)) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = 0.5;
    music.audioEl = audio;
  }
  return music.audioEl;
}

async function startReadingMusic(state) {
  const url = resolveTraceGameMusicUrl(state);
  if (!url) {
    playGeneratedMusic(state);
    return false;
  }
  const music = state.audio.music;
  const audio = ensureReadingMusicAudio(state);
  const changed = String(music.url || "") !== url;
  if (changed) {
    music.url = url;
    music.lastError = "";
    try { audio.pause(); } catch (_) { }
    audio.src = url;
    try { audio.load(); } catch (_) { }
  }
  try {
    await audio.play();
    return true;
  } catch (error) {
    playGeneratedMusic(state);
    music.lastError = String(error?.message || "music_play_failed");
    return false;
  }
}

function playGeneratedMusic(state) {
  try {
    if (!state.audio.ctx) state.audio.ctx = new AudioContext();
    const ctx = state.audio.ctx;
    const now = ctx.currentTime;
    const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
    let noteIdx = 0;
    const playNote = () => {
      if (state.mode !== "playing") return;
      const freq = notes[noteIdx % notes.length];
      noteIdx++;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    };
    state.musicInterval = setInterval(playNote, 500);
  } catch (_) { }
}

function pauseReadingMusic(state) {
  if (state.musicInterval) {
    clearInterval(state.musicInterval);
    state.musicInterval = null;
  }
  const music = state?.audio?.music;
  const audio = music?.audioEl;
  if (audio instanceof HTMLAudioElement) {
    try { audio.pause(); } catch (_) { }
  }
}

function stopReadingMusic(state) {
  if (state.musicInterval) {
    clearInterval(state.musicInterval);
    state.musicInterval = null;
  }
  const music = state?.audio?.music;
  const audio = music?.audioEl;
  if (!(audio instanceof HTMLAudioElement)) return;
  try { audio.pause(); } catch (_) { }
  try { audio.currentTime = 0; } catch (_) { }
}

function setThemeClass(root, state) {
  const shell = root.querySelector("#traceGameShell");
  if (!shell) return;
  shell.classList.remove("theme-kawaii", "theme-tech", "theme-matsuri");
  shell.classList.add(`theme-${state.themes[state.themeIndex]}`);
}

function nearestDistanceToPath(x, y, points) {
  let best = Number.POSITIVE_INFINITY;
  const stride = Math.max(1, Math.floor(points.length / 160));
  for (let i = 0; i < points.length; i += stride) {
    const p = points[i];
    const d = dist(x, y, p.x, p.y);
    if (d < best) best = d;
  }
  return best;
}

function exposeDebugApi(state, ui) {
  window.render_game_to_text = () => JSON.stringify({
    mode: state.mode,
    readingTitle: state.reading.title,
    letter: state.letters[state.letterIndex] || "A",
    currentWord: state.currentWord || "",
    progress: Number(state.progress.toFixed(3)),
    score: Math.round(state.score),
    combo: state.combo,
    timerMs: Math.round(state.roundLeftMs),
    cameraReady: state.camera.ready === true,
    pointerSource: state.pointer.source,
    pinchActive: state.traceFlow.pinchActive === true,
    strokeIndex: state.traceFlow.strokeIndex,
    hoveredAction: state.dwell.targetAction || "",
    version: state.version
  });

  window.advanceTime = (ms = 16) => {
    const total = Math.max(0, Number(ms || 0));
    const chunks = Math.max(1, Math.ceil(total / 16));
    const dt = total / chunks;
    for (let i = 0; i < chunks; i += 1) {
      updateGame(state, ui, dt, performance.now());
    }
    render(state, ui);
    return window.render_game_to_text();
  };

  window.__traceGameDebug = {
    start: () => handleAction("start", state, ui),
    reset: () => handleAction("reset", state, ui),
    next: () => handleAction("next", state, ui),
    toggleCamera: () => handleAction("camera", state, ui),
    setLevel: (lvl) => { state.level = parseInt(lvl); refreshHud(ui, state); }
  };
}

async function syncTraceScoresToFirebase(state, reason = "snapshot") {
  try {
    const raw = sessionStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY) || localStorage.getItem(LECTURAS_TRACE_ACTIVE_READING_KEY);
    const context = raw ? JSON.parse(raw) : null;
    const session = context?.session || context?.user || null;
    if (!session || !session.loggedIn) return;

    // We rely on the global runtime from order app if injected, 
    // but we always fallback to direct profile manipulation to ensure sync.
    const profilesRaw = localStorage.getItem("cb_lecturas_game_players_v1");
    const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
    const alias = session.alias || session.username || "";
    const playerKey = String(alias).toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 64);
    const player = profiles[playerKey] || {};

    if (!player.gameStats) player.gameStats = {};
    const stats = player.gameStats.trace || {};

    stats.level = Math.max(stats.level || 1, state.level);
    stats.bestScore = Math.max(stats.bestScore || 0, state.score);
    stats.totalScore = (stats.totalScore || 0) + state.score;
    stats.gems = (stats.gems || 0) + (state.mode === "completed" ? 1 : 0);
    stats.updatedAt = Date.now();

    player.gameStats.trace = stats;
    profiles[playerKey] = player;
    localStorage.setItem("cb_lecturas_game_players_v1", JSON.stringify(profiles));

    // If order app service is available, trigger a deeper sync
    if (window._lecturasGameQueueOrSyncScore && typeof window._lecturasGameQueueOrSyncScore === 'function') {
      const payload = {
        reason,
        gameId: "trace",
        level: state.level,
        score: state.score,
        gameStats: player.gameStats,
        lecturaId: state.reading.id || ""
      };
      await window._lecturasGameQueueOrSyncScore(session, payload);
    }
  } catch (e) {
    console.warn("[Trace] Score sync failed", e);
  }
}

function injectStyles() {
  if (document.getElementById("trace-game-independent-style")) return;
  const style = document.createElement("style");
  style.id = "trace-game-independent-style";
  style.textContent = `
    body.trace-fullscreen-mode {
      margin: 0;
      overflow: hidden;
      background: #050a19;
    }

    #traceIndependentMount {
      position: fixed;
      inset: 0;
      z-index: 9999;
      width: 100vw;
      height: 100vh;
      padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
      background:
        radial-gradient(circle at 12% 16%, rgba(255,255,255,0.14), transparent 38%),
        radial-gradient(circle at 86% 80%, rgba(255,255,255,0.08), transparent 32%),
        #091022;
      box-sizing: border-box;
    }

    .trace-game-shell {
      --trace-bg: #f4f8ff;
      --trace-surface: rgba(255,255,255,0.88);
      --trace-ink: #122047;
      --trace-muted: #44639e;
      --trace-accent: #3ad1ff;
      --trace-accent-2: #79f3a9;
      --trace-shadow: 0 22px 44px rgba(12, 31, 66, 0.22);
      --trace-reading-bg-image: none;
      width: 100%;
      height: 100%;
      max-width: none;
      margin: 0;
      border-radius: 0;
      padding: 16px;
      background:
        linear-gradient(180deg, rgba(9, 16, 34, 0.34), rgba(9, 16, 34, 0.34)),
        var(--trace-reading-bg-image),
        linear-gradient(160deg, #173f7f, #195f94 54%, #1c84aa);
      background-size: cover, cover, auto, auto, auto;
      background-position: center, center, center, center, center;
      color: var(--trace-ink);
      box-shadow: none;
      font-family: "Nunito", "Segoe UI", sans-serif;
      border: none;
      box-sizing: border-box;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      position: relative;
      --trace-right-panel-width: clamp(156px, 15.5vw, 188px);
      --trace-right-rail-gap: 22px;
      --trace-topbar-height: 0px;
    }

    .trace-game-shell.theme-kawaii {
      --trace-bg: linear-gradient(135deg, #ffd8ef, #d6f6ff 52%, #fff4d2);
      --trace-accent: #ff6fb8;
      --trace-accent-2: #42e4d4;
    }

    .trace-game-shell.theme-tech {
      --trace-bg: linear-gradient(135deg, #e9f7ff, #e9fff8);
      --trace-accent: #2f8dff;
      --trace-accent-2: #10d2b3;
    }

    .trace-game-shell.theme-matsuri {
      --trace-bg: linear-gradient(135deg, #fff0d9, #ffe5ef);
      --trace-accent: #ff8a2d;
      --trace-accent-2: #ff4b95;
    }

    .trace-topbar {
      position: absolute;
      right: 12px;
      top: 12px;
      z-index: 11;
      width: var(--trace-right-panel-width);
      display: grid;
      gap: 6px;
      margin: 0;
      background: linear-gradient(180deg, rgba(20, 30, 56, 0.96), rgba(14, 22, 41, 0.94));
      border: none;
      border-radius: 8px;
      padding: 8px;
      pointer-events: none;
    }

    .trace-kicker {
      margin: 0;
      font-weight: 800;
      letter-spacing: 0.08em;
      font-size: 0.76rem;
      text-transform: uppercase;
      color: #dbe8ff;
    }

    .trace-topbar h2 {
      margin: 0;
      font-size: clamp(0.72rem, 1vw, 0.84rem);
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      line-height: 1.14;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .trace-hint {
      margin: 2px 0 0;
      color: #edf5ff;
      font-weight: 800;
      font-size: 0.62rem;
      text-shadow: 0 1px 4px rgba(0,0,0,0.45);
      line-height: 1.15;
      min-height: 2.2em;
    }

    .trace-pill-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      justify-content: stretch;
    }

    .trace-pill {
      border-radius: 3px;
      padding: 4px 7px;
      background: linear-gradient(180deg, #77a4ff 0 14%, #567dd6 14% 62%, #4262ad 62% 100%);
      border: 2px solid #11170e;
      font-weight: 700;
      font-size: 0.72rem;
      color: #f2f7ed;
      text-shadow: 0 1px 0 rgba(0,0,0,0.42);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      line-height: 1;
    }

    .trace-pill b {
      font-size: 0.74rem;
      color: #ffffff;
      letter-spacing: 0.02em;
      text-shadow: 0 1px 0 rgba(0,0,0,0.46);
    }

    .trace-pill:nth-child(2n) {
      background: linear-gradient(180deg, #9e8bff 0 14%, #7760d3 14% 62%, #5d49ab 62% 100%);
    }

    .trace-pill:nth-child(3n) {
      background: linear-gradient(180deg, #5fc7d5 0 14%, #3f98ad 14% 62%, #337286 62% 100%);
    }

    .trace-pill:nth-child(5n) {
      background: linear-gradient(180deg, #d78ec8 0 14%, #af67a2 14% 62%, #874f7f 62% 100%);
    }

    .trace-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
      min-height: 0;
      width: 100%;
      box-sizing: border-box;
    }

    .trace-stage-wrap {
      position: relative;
      min-height: 0;
      height: 100%;
      width: 100%;
      max-width: 100%;
      border-radius: 0;
      overflow: hidden;
      background: transparent;
      border: none;
      box-shadow: none;
      --trace-shake-x: 0px;
      --trace-shake-y: 0px;
      --trace-shake-scale: 1;
    }

    .trace-game-shell.couple-mode .trace-stage-wrap {
      display: flex;
      flex-direction: row;
    }

    .trace-game-shell.couple-mode .trace-player-area {
      flex: 1;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-right: 2px dashed rgba(255,255,255,0.4);
      min-height: 0;
    }

    .trace-game-shell.couple-mode .trace-player-area:last-child {
      border-right: none;
    }

    .trace-game-shell.couple-mode .trace-player-label {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.5);
      color: #fff;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: bold;
      z-index: 10;
    }

    .trace-game-shell.couple-mode .trace-player-canvas-wrap {
      flex: 1;
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trace-game-shell.couple-mode .trace-player-canvas-wrap canvas {
      max-width: 100%;
      max-height: 100%;
    }

    .trace-game-shell.couple-mode .trace-player-info {
      display: flex;
      gap: 16px;
      padding: 8px;
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 0.8rem;
    }

    .trace-game-shell.couple-mode .trace-canvas-controls {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      z-index: 20;
    }

    .trace-game-shell.couple-mode #traceCanvas {
      display: none;
    }

    .trace-game-shell.couple-mode #traceCanvasA,
    .trace-game-shell.couple-mode #traceCanvasB {
      display: block;
      width: 100%;
      height: 100%;
    }

      transform: translate3d(var(--trace-shake-x), var(--trace-shake-y), 0) scale(var(--trace-shake-scale));
      transform-origin: center center;
      box-sizing: border-box;
    }

    .trace-camera-feed {
      position: absolute;
      width: 1px;
      height: 1px;
      left: -9999px;
      top: -9999px;
      object-fit: contain;
      transform: none;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
    }

    #traceCanvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      touch-action: none;
      cursor: crosshair;
      z-index: 2100;
      pointer-events: none;
    }

    .trace-camera-feed {
      display: none !important;
    }

    .trace-control-panel {
      position: static;
      border-radius: 4px;
      background: linear-gradient(180deg, rgba(30, 44, 24, 0.92), rgba(24, 34, 19, 0.9));
      border: 1px solid #181c12;
      padding: 8px;
      display: grid;
      gap: 10px;
      align-content: start;
      overflow: auto;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.3), 0 3px 0 rgba(10,14,8,0.45);
    }

    [hidden] {
      display: none !important;
    }

    .trace-canvas-controls {
      position: absolute;
      right: 12px;
      top: calc(12px + var(--trace-topbar-height) + var(--trace-right-rail-gap));
      transform: none;
      z-index: 2500;
      display: grid;
      grid-template-columns: 1fr;
      gap: 64px;
      width: var(--trace-right-panel-width);
      pointer-events: auto;
    }

    .trace-mobile-controls {
      display: none;
    }

    .trace-hud-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .trace-stat {
      margin: 0;
      border-radius: 3px;
      padding: 7px;
      background: linear-gradient(180deg, #7ea9c9 0 14%, #5f85a6 14% 62%, #4a6883 62% 100%);
      border: 1px solid #11170e;
      display: grid;
      gap: 3px;
    }

    .trace-stat span {
      font-size: 0.72rem;
      color: #e7f1ff;
      font-weight: 700;
    }

    .trace-stat b {
      font-size: 1rem;
      color: #ffffff;
      font-weight: 900;
      text-shadow: 0 1px 0 rgba(0,0,0,0.35);
    }

    .trace-btn-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .trace-touch-btn {
      position: relative;
      width: 100%;
      min-height: 36px;
      text-align: center;
      cursor: pointer;
      overflow: hidden;
    }

    .trace-touch-btn.is-short {
      font-size: 0.95rem;
      padding: 0.7rem 0.85rem;
      letter-spacing: 0.03em;
      min-height: 58px;
      line-height: 1.05;
      font-weight: 900;
      white-space: nowrap;
    }

    .trace-touch-btn::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(58, 209, 255, 0.12), rgba(121, 243, 169, 0.16));
      transform-origin: left center;
      transform: scaleX(var(--trace-dwell, 0));
      transition: transform 100ms linear;
      pointer-events: none;
    }

    .trace-intro-modal {
      position: absolute;
      inset: 0;
      z-index: 5000;
      background: rgba(8, 17, 38, 0.82);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: trace-fade-in 0.4s ease-out;
    }

    @keyframes trace-fade-in {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    .trace-modal-content {
      background: #ffffff;
      border-radius: 28px;
      width: 100%;
      max-width: 680px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 30px 60px rgba(0,0,0,0.5), 0 0 0 10px rgba(255,255,255,0.1);
      border: 4px solid #1c84aa;
    }

    .trace-modal-header {
      padding: 32px 32px 12px;
      text-align: center;
    }

    .trace-modal-icon {
      font-size: 3rem;
      margin-bottom: 8px;
    }

    .trace-modal-header h2 {
      margin: 0;
      font-size: 2rem;
      color: #122047;
      font-weight: 900;
    }

    .trace-modal-body {
      padding: 12px 32px 32px;
    }

    .trace-tutorial-grid {
      display: grid;
      gap: 24px;
    }

    .trace-tutorial-step {
      display: flex;
      gap: 16px;
      align-items: center;
      background: #f4f8ff;
      padding: 16px;
      border-radius: 18px;
      border: 2px solid #e0ebff;
    }

    .trace-step-num {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: #1c84aa;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 1.2rem;
    }

    .trace-tutorial-step p {
      margin: 0;
      font-size: 1.1rem;
      color: #324879;
      line-height: 1.4;
    }

    .trace-gesture-img {
      width: 140px;
      height: 140px;
      object-fit: contain;
      border-radius: 12px;
      background: #fff;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .trace-modal-footer {
      padding: 0 32px 40px;
      display: flex;
      justify-content: center;
    }

    .trace-touch-btn.is-gold {
      background: linear-gradient(180deg, #ffd85d, #ffa500);
      color: #122047;
      border: 4px solid #fff;
      box-shadow: 0 8px 0 #b36e00, 0 15px 30px rgba(255, 165, 0, 0.4);
      padding: 16px 40px;
      font-size: 1.4rem;
      border-radius: 20px;
      min-width: 280px;
      transition: all 0.2s;
    }

    .trace-touch-btn.is-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 0 #b36e00, 0 20px 40px rgba(255, 165, 0, 0.5);
    }

    .trace-touch-btn:hover,
    .trace-touch-btn.is-avatar-hover {
      outline: 2px solid rgba(78, 213, 255, 0.95);
      transform: translateY(-1px) scale(1.01);
    }

      transform: translateY(-1px) scale(1.01);
    }

    .trace-mini-help {
      margin: 2px 0 0;
      font-size: 0.78rem;
      color: #edf5ff;
      text-shadow: 0 1px 4px rgba(0,0,0,0.45);
      font-weight: 700;
    }

    @media (max-width: 1100px) {
      .trace-layout {
        grid-template-columns: 1fr;
      }

      .trace-stage-wrap {
        min-height: 48vh;
      }

      .trace-btn-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .trace-canvas-controls {
        width: var(--trace-right-panel-width);
      }
    }

    @media (max-width: 720px) {
      #traceIndependentMount {
        padding: 0;
      }

      .trace-game-shell {
        border-radius: 0;
        padding: 6px;
        display: flex;
        flex-direction: column;
      }

      .trace-topbar {
        position: relative;
        right: auto;
        top: auto;
        width: 100%;
        margin-bottom: 4px;
        padding: 4px 6px;
      }

      .trace-topbar > div:first-child {
        display: none;
      }

      .trace-topbar h2 {
        font-size: 0.7rem;
      }

      .trace-pill-row {
        display: flex;
        flex-wrap: nowrap;
        gap: 2px;
        justify-content: space-between;
      }

      .trace-pill {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 0.55rem;
        padding: 2px 4px;
        justify-content: center;
        gap: 2px;
      }

      .trace-pill b {
        font-size: 0.6rem;
      }

      .trace-pill span:not(:first-child) {
        display: none;
      }

      .trace-hint {
        font-size: 0.7rem;
        display: none;
      }

      .trace-stage-wrap {
        height: auto;
        flex: 1;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
      }

      .trace-layout {
        flex: 1;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      #traceCanvas {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
      }

      .trace-btn-grid {
        grid-template-columns: 1fr;
      }

      .trace-canvas-controls {
        display: none;
      }

      .trace-mobile-controls {
        display: flex;
        flex-wrap: nowrap;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 6px 4px;
        box-sizing: border-box;
      }

      .trace-mobile-controls .trace-touch-btn {
        flex: 1 1 0;
        min-width: 0;
        max-width: calc(33.33% - 4px);
        min-height: 40px;
        font-size: 0.8rem;
        padding: 4px 6px;
      }

      .trace-hud-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* Tablet styles (iPad, Android tablets) */
    @media (min-width: 721px) and (max-width: 1024px) {
      #traceIndependentMount {
        padding: 8px;
      }

      .trace-game-shell {
        padding: 12px;
      }

      .trace-topbar {
        position: absolute;
        right: 8px;
        top: 8px;
        width: 140px;
      }

      .trace-topbar h2 {
        font-size: 0.8rem;
      }

      .trace-pill-row {
        gap: 3px;
      }

      .trace-pill {
        font-size: 0.65rem;
        padding: 3px 5px;
      }

      .trace-pill b {
        font-size: 0.68rem;
      }

      .trace-hint {
        font-size: 0.58rem;
      }

      .trace-stage-wrap {
        min-height: 55vh;
        border-radius: 10px;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
      }

      .trace-layout {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      #traceCanvas {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
      }

      .trace-canvas-controls {
        right: 8px;
        top: auto;
        bottom: 12px;
        gap: 12px;
        width: min(160px, 20vw);
      }

      .trace-canvas-controls .trace-touch-btn {
        min-height: 50px;
        font-size: 0.9rem;
      }
    }

    /* Large tablets and small laptops */
    @media (min-width: 1025px) and (max-width: 1366px) {
      .trace-topbar {
        width: 160px;
      }

      .trace-stage-wrap {
        min-height: 60vh;
      }

      .trace-canvas-controls {
        width: min(170px, 15vw);
      }
    }

    /* Portrait mobile */
    @media (max-width: 480px) and (orientation: portrait) {
      .trace-game-shell {
        padding: 4px;
      }

      .trace-topbar {
        padding: 2px 4px;
        margin-bottom: 2px;
      }

      .trace-topbar > div:first-child {
        display: none;
      }

      .trace-topbar h2 {
        font-size: 0.65rem;
      }

      .trace-pill-row {
        display: flex;
        flex-wrap: nowrap;
        gap: 1px;
      }

      .trace-pill {
        flex: 1 1 auto;
        font-size: 0.5rem;
        padding: 1px 3px;
        min-width: 0;
      }

      .trace-pill b {
        font-size: 0.55rem;
      }

      .trace-pill span:not(:first-child) {
        display: none;
      }

      .trace-hint {
        display: none;
      }

      .trace-stage-wrap {
        height: auto;
        flex: 1;
        max-width: 100%;
        overflow: hidden;
      }

      .trace-layout {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      #traceCanvas {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
      }

      .trace-canvas-controls {
        display: none;
      }

      .trace-mobile-controls {
        display: flex;
        flex-wrap: nowrap;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 4px 2px;
        box-sizing: border-box;
      }

      .trace-mobile-controls .trace-touch-btn {
        flex: 1 1 0;
        min-width: 0;
        max-width: calc(33.33% - 3px);
        min-height: 36px;
        font-size: 0.75rem;
        padding: 3px 4px;
      }
    }

    /* Landscape mobile */
    @media (max-width: 850px) and (orientation: landscape) {
      .trace-topbar {
        right: 4px;
        top: 4px;
        width: 100px;
        padding: 3px;
      }

      .trace-topbar > div:first-child {
        display: none;
      }

      .trace-pill-row {
        gap: 1px;
      }

      .trace-pill {
        font-size: 0.45rem;
        padding: 1px 3px;
      }

      .trace-pill b {
        font-size: 0.5rem;
      }

      .trace-pill span:not(:first-child) {
        display: none;
      }

      .trace-hint {
        display: none;
      }

      .trace-stage-wrap {
        min-height: 80vh;
      }

      .trace-canvas-controls {
        display: none;
      }

      .trace-mobile-controls {
        display: flex;
        flex-wrap: nowrap;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 6px 4px;
        box-sizing: border-box;
        position: absolute;
        bottom: 8px;
        left: 0;
        right: 0;
      }

      .trace-mobile-controls .trace-touch-btn {
        flex: 1 1 0;
        min-width: 0;
        max-width: calc(33.33% - 4px);
        min-height: 36px;
        font-size: 0.7rem;
        padding: 4px 6px;
      }
    }
  `;

  document.head.appendChild(style);
}

const LETTER_STROKES = {
  "A": [
    [
      [
        0.5,
        0.05
      ],
      [
        0.15,
        0.95
      ]
    ],
    [
      [
        0.5,
        0.05
      ],
      [
        0.85,
        0.95
      ]
    ],
    [
      [
        0.3,
        0.6
      ],
      [
        0.7,
        0.6
      ]
    ]
  ],
  "B": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.665,
        0.067
      ],
      [
        0.762,
        0.116
      ],
      [
        0.827,
        0.189
      ],
      [
        0.85,
        0.275
      ],
      [
        0.827,
        0.361
      ],
      [
        0.762,
        0.434
      ],
      [
        0.665,
        0.483
      ],
      [
        0.55,
        0.5
      ],
      [
        0.55,
        0.5
      ],
      [
        0.2,
        0.5
      ]
    ],
    [
      [
        0.2,
        0.5
      ],
      [
        0.6,
        0.5
      ],
      [
        0.6,
        0.5
      ],
      [
        0.715,
        0.517
      ],
      [
        0.812,
        0.566
      ],
      [
        0.877,
        0.639
      ],
      [
        0.9,
        0.725
      ],
      [
        0.877,
        0.811
      ],
      [
        0.812,
        0.884
      ],
      [
        0.715,
        0.933
      ],
      [
        0.6,
        0.95
      ],
      [
        0.6,
        0.95
      ],
      [
        0.2,
        0.95
      ]
    ]
  ],
  "C": [
    [
      [
        0.783,
        0.818
      ],
      [
        0.689,
        0.897
      ],
      [
        0.578,
        0.941
      ],
      [
        0.461,
        0.948
      ],
      [
        0.347,
        0.916
      ],
      [
        0.246,
        0.848
      ],
      [
        0.167,
        0.75
      ],
      [
        0.117,
        0.631
      ],
      [
        0.1,
        0.5
      ],
      [
        0.117,
        0.369
      ],
      [
        0.167,
        0.25
      ],
      [
        0.246,
        0.152
      ],
      [
        0.347,
        0.084
      ],
      [
        0.461,
        0.052
      ],
      [
        0.578,
        0.059
      ],
      [
        0.689,
        0.103
      ],
      [
        0.783,
        0.182
      ]
    ]
  ],
  "D": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.45,
        0.05
      ],
      [
        0.45,
        0.05
      ],
      [
        0.554,
        0.065
      ],
      [
        0.65,
        0.11
      ],
      [
        0.733,
        0.182
      ],
      [
        0.796,
        0.275
      ],
      [
        0.836,
        0.384
      ],
      [
        0.85,
        0.5
      ],
      [
        0.836,
        0.616
      ],
      [
        0.796,
        0.725
      ],
      [
        0.733,
        0.818
      ],
      [
        0.65,
        0.89
      ],
      [
        0.554,
        0.935
      ],
      [
        0.45,
        0.95
      ],
      [
        0.45,
        0.95
      ],
      [
        0.2,
        0.95
      ]
    ]
  ],
  "E": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.05
      ]
    ],
    [
      [
        0.2,
        0.5
      ],
      [
        0.7,
        0.5
      ]
    ],
    [
      [
        0.2,
        0.95
      ],
      [
        0.8,
        0.95
      ]
    ]
  ],
  "I": [
    [
      [
        0.5,
        0.05
      ],
      [
        0.5,
        0.95
      ]
    ],
    [
      [
        0.3,
        0.05
      ],
      [
        0.7,
        0.05
      ]
    ],
    [
      [
        0.3,
        0.95
      ],
      [
        0.7,
        0.95
      ]
    ]
  ],
  "L": [
    [
      [
        0.25,
        0.05
      ],
      [
        0.25,
        0.95
      ]
    ],
    [
      [
        0.25,
        0.95
      ],
      [
        0.8,
        0.95
      ]
    ]
  ],
  "M": [
    [
      [
        0.15,
        0.95
      ],
      [
        0.15,
        0.05
      ]
    ],
    [
      [
        0.15,
        0.05
      ],
      [
        0.5,
        0.6
      ]
    ],
    [
      [
        0.5,
        0.6
      ],
      [
        0.85,
        0.05
      ]
    ],
    [
      [
        0.85,
        0.05
      ],
      [
        0.85,
        0.95
      ]
    ]
  ],
  "N": [
    [
      [
        0.2,
        0.95
      ],
      [
        0.2,
        0.05
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.95
      ]
    ],
    [
      [
        0.8,
        0.95
      ],
      [
        0.8,
        0.05
      ]
    ]
  ],
  "O": [
    [
      [
        0.5,
        0.05
      ],
      [
        0.604,
        0.065
      ],
      [
        0.7,
        0.11
      ],
      [
        0.783,
        0.182
      ],
      [
        0.846,
        0.275
      ],
      [
        0.886,
        0.384
      ],
      [
        0.9,
        0.5
      ],
      [
        0.886,
        0.616
      ],
      [
        0.846,
        0.725
      ],
      [
        0.783,
        0.818
      ],
      [
        0.7,
        0.89
      ],
      [
        0.604,
        0.935
      ],
      [
        0.5,
        0.95
      ],
      [
        0.396,
        0.935
      ],
      [
        0.3,
        0.89
      ],
      [
        0.217,
        0.818
      ],
      [
        0.154,
        0.725
      ],
      [
        0.114,
        0.616
      ],
      [
        0.1,
        0.5
      ],
      [
        0.114,
        0.384
      ],
      [
        0.154,
        0.275
      ],
      [
        0.217,
        0.182
      ],
      [
        0.3,
        0.11
      ],
      [
        0.396,
        0.065
      ],
      [
        0.5,
        0.05
      ]
    ]
  ],
  "P": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.658,
        0.061
      ],
      [
        0.756,
        0.093
      ],
      [
        0.833,
        0.143
      ],
      [
        0.883,
        0.205
      ],
      [
        0.9,
        0.275
      ],
      [
        0.883,
        0.345
      ],
      [
        0.833,
        0.407
      ],
      [
        0.756,
        0.457
      ],
      [
        0.658,
        0.489
      ],
      [
        0.55,
        0.5
      ],
      [
        0.55,
        0.5
      ],
      [
        0.2,
        0.5
      ]
    ]
  ],
  "R": [
    [
      [
        0.2,
        0.95
      ],
      [
        0.2,
        0.05
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.55,
        0.05
      ],
      [
        0.658,
        0.061
      ],
      [
        0.756,
        0.093
      ],
      [
        0.833,
        0.143
      ],
      [
        0.883,
        0.205
      ],
      [
        0.9,
        0.275
      ],
      [
        0.883,
        0.345
      ],
      [
        0.833,
        0.407
      ],
      [
        0.756,
        0.457
      ],
      [
        0.658,
        0.489
      ],
      [
        0.55,
        0.5
      ],
      [
        0.55,
        0.5
      ],
      [
        0.2,
        0.5
      ]
    ],
    [
      [
        0.4,
        0.5
      ],
      [
        0.85,
        0.95
      ]
    ]
  ],
  "S": [
    [
      [
        0.288,
        0.434
      ],
      [
        0.223,
        0.361
      ],
      [
        0.2,
        0.275
      ],
      [
        0.223,
        0.189
      ],
      [
        0.288,
        0.116
      ],
      [
        0.385,
        0.067
      ],
      [
        0.5,
        0.05
      ],
      [
        0.615,
        0.067
      ],
      [
        0.712,
        0.116
      ],
      [
        0.777,
        0.189
      ],
      [
        0.8,
        0.275
      ],
      [
        0.15,
        0.725
      ],
      [
        0.177,
        0.811
      ],
      [
        0.253,
        0.884
      ],
      [
        0.366,
        0.933
      ],
      [
        0.5,
        0.95
      ],
      [
        0.634,
        0.933
      ],
      [
        0.747,
        0.884
      ],
      [
        0.823,
        0.811
      ],
      [
        0.85,
        0.725
      ],
      [
        0.823,
        0.639
      ],
      [
        0.747,
        0.566
      ]
    ]
  ],
  "T": [
    [
      [
        0.5,
        0.05
      ],
      [
        0.5,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.05
      ]
    ]
  ],
  "U": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.6
      ],
      [
        0.2,
        0.6
      ],
      [
        0.215,
        0.708
      ],
      [
        0.257,
        0.806
      ],
      [
        0.324,
        0.883
      ],
      [
        0.407,
        0.933
      ],
      [
        0.5,
        0.95
      ],
      [
        0.593,
        0.933
      ],
      [
        0.676,
        0.883
      ],
      [
        0.743,
        0.806
      ],
      [
        0.785,
        0.708
      ],
      [
        0.8,
        0.6
      ],
      [
        0.8,
        0.6
      ],
      [
        0.8,
        0.05
      ]
    ]
  ],
  "F": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.05
      ]
    ],
    [
      [
        0.2,
        0.5
      ],
      [
        0.7,
        0.5
      ]
    ]
  ],
  "G": [
    [
      [
        0.5,
        0.95
      ],
      [
        0.578,
        0.941
      ],
      [
        0.653,
        0.916
      ],
      [
        0.722,
        0.874
      ],
      [
        0.783,
        0.818
      ],
      [
        0.833,
        0.75
      ],
      [
        0.87,
        0.672
      ],
      [
        0.892,
        0.588
      ],
      [
        0.9,
        0.5
      ],
      [
        0.892,
        0.412
      ],
      [
        0.87,
        0.328
      ],
      [
        0.833,
        0.25
      ],
      [
        0.783,
        0.182
      ],
      [
        0.722,
        0.126
      ],
      [
        0.653,
        0.084
      ],
      [
        0.578,
        0.059
      ],
      [
        0.5,
        0.05
      ],
      [
        0.422,
        0.059
      ],
      [
        0.347,
        0.084
      ],
      [
        0.278,
        0.126
      ],
      [
        0.217,
        0.182
      ],
      [
        0.8,
        0.9
      ],
      [
        0.8,
        0.5
      ],
      [
        0.5,
        0.5
      ]
    ]
  ],
  "H": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.8,
        0.05
      ],
      [
        0.8,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.5
      ],
      [
        0.8,
        0.5
      ]
    ]
  ],
  "J": [
    [
      [
        0.4,
        0.05
      ],
      [
        0.9,
        0.05
      ]
    ],
    [
      [
        0.7,
        0.05
      ],
      [
        0.7,
        0.7
      ],
      [
        0.7,
        0.7
      ],
      [
        0.688,
        0.777
      ],
      [
        0.652,
        0.847
      ],
      [
        0.597,
        0.902
      ],
      [
        0.527,
        0.938
      ],
      [
        0.45,
        0.95
      ],
      [
        0.373,
        0.938
      ],
      [
        0.303,
        0.902
      ],
      [
        0.248,
        0.847
      ],
      [
        0.212,
        0.777
      ],
      [
        0.2,
        0.7
      ],
      [
        0.2,
        0.7
      ]
    ]
  ],
  "K": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.8,
        0.05
      ],
      [
        0.2,
        0.5
      ]
    ],
    [
      [
        0.2,
        0.5
      ],
      [
        0.8,
        0.95
      ]
    ]
  ],
  "Q": [
    [
      [
        0.5,
        0.05
      ],
      [
        0.604,
        0.065
      ],
      [
        0.7,
        0.11
      ],
      [
        0.783,
        0.182
      ],
      [
        0.846,
        0.275
      ],
      [
        0.886,
        0.384
      ],
      [
        0.9,
        0.5
      ],
      [
        0.886,
        0.616
      ],
      [
        0.846,
        0.725
      ],
      [
        0.783,
        0.818
      ],
      [
        0.7,
        0.89
      ],
      [
        0.604,
        0.935
      ],
      [
        0.5,
        0.95
      ],
      [
        0.396,
        0.935
      ],
      [
        0.3,
        0.89
      ],
      [
        0.217,
        0.818
      ],
      [
        0.154,
        0.725
      ],
      [
        0.114,
        0.616
      ],
      [
        0.1,
        0.5
      ],
      [
        0.114,
        0.384
      ],
      [
        0.154,
        0.275
      ],
      [
        0.217,
        0.182
      ],
      [
        0.3,
        0.11
      ],
      [
        0.396,
        0.065
      ],
      [
        0.5,
        0.05
      ]
    ],
    [
      [
        0.65,
        0.65
      ],
      [
        0.95,
        0.95
      ]
    ]
  ],
  "V": [
    [
      [
        0.1,
        0.05
      ],
      [
        0.5,
        0.95
      ]
    ],
    [
      [
        0.5,
        0.95
      ],
      [
        0.9,
        0.05
      ]
    ]
  ],
  "W": [
    [
      [
        0.05,
        0.05
      ],
      [
        0.3,
        0.95
      ]
    ],
    [
      [
        0.3,
        0.95
      ],
      [
        0.5,
        0.4
      ]
    ],
    [
      [
        0.5,
        0.4
      ],
      [
        0.7,
        0.95
      ]
    ],
    [
      [
        0.7,
        0.95
      ],
      [
        0.95,
        0.05
      ]
    ]
  ],
  "X": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.95
      ]
    ],
    [
      [
        0.8,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ]
  ],
  "Y": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.5,
        0.5
      ]
    ],
    [
      [
        0.8,
        0.05
      ],
      [
        0.5,
        0.5
      ]
    ],
    [
      [
        0.5,
        0.5
      ],
      [
        0.5,
        0.95
      ]
    ]
  ],
  "Z": [
    [
      [
        0.2,
        0.05
      ],
      [
        0.8,
        0.05
      ]
    ],
    [
      [
        0.8,
        0.05
      ],
      [
        0.2,
        0.95
      ]
    ],
    [
      [
        0.2,
        0.95
      ],
      [
        0.8,
        0.95
      ]
    ]
  ]
};

function getGradeWeight(state) {
  const g = String(state.reading.grade || "1").toLowerCase();
  if (g.includes("6")) return 6;
  if (g.includes("5")) return 5;
  if (g.includes("4")) return 4;
  if (g.includes("3")) return 3;
  if (g.includes("2")) return 2;
  return 1; // Default
}

function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  return Math.hypot(cx - nearestX, cy - nearestY) <= cr;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Check if we should boot trace mode automatically (e.g. if the URL says so)
(function maybeBootTrace() {
  if (window.__CB_TRACE_GAME_BOOTED__) return;
  
  const params = new URLSearchParams(window.location.search || "");
  const isTraceGame = params.get("game") === "trace" || params.get("game") === "trazos";
  
  // Only auto-init if we are specifically here for trace and not coming from the main order app
  if (isTraceGame && !window.lecturasGameModeRuntime) {
     window.__CB_TRACE_GAME_BOOTED__ = true;
     initTraceGame();
  }
})();
