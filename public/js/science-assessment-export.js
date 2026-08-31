(function () {
  async function mountSimulator() {
    controls.classList.add("science-game-controls-hidden");
    window.SCIENCE_SIMULATOR_PHASER_URL = "./vendor/phaser/phaser.esm.js";
    var runtime = await import("./science-simulator-runtime.mjs");
    await runtime.createScienceSimulator(gameMount, {
      title: config.title || config.challenge && config.challenge.title, subtitle: config.subtitle,
      mission: config.mission || config.challenge && config.challenge.description,
      scientificPrinciple: config.scientificPrinciple, visualStyle: config.visualStyle,
      simulationType: config.simulationType, scenario: config.theme, controls: config.controls,
      challenge: config.challenge, simulator: config.simulator, visualScene: config.visualScene, curriculumProfile: config.curriculumProfile,
      profileId: config.profileId, profileVersion: config.profileVersion
    });
  }

  "use strict";

  var config = window.SCIENCE_ASSESSMENT_CONFIG;
  if (!config || (config.gameMode !== "simulator" && (!Array.isArray(config.questions) || !config.questions.length))) return;

  function safeGeneratedText(value) {
    var text = typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim() : "";
    return text && !/^(?:undefined|null|nan|\[object object\])$/i.test(text) ? text : "";
  }

  config.experiencePrompt = safeGeneratedText(config.experiencePrompt);
  config.mission = safeGeneratedText(config.mission)
    || safeGeneratedText(config.challenge && config.challenge.description)
    || "Completa la experiencia sobre " + (safeGeneratedText(config.topic) || "el tema seleccionado") + ".";
  config.scientificPrinciple = safeGeneratedText(config.scientificPrinciple)
    || "Relaciona las variables manipuladas con la evidencia observada sobre " + (safeGeneratedText(config.topic) || "el tema seleccionado") + ".";
  var isLabMode = config.gameMode === "lab";

  function createProgressState() {
    return {
      level: 1, question: 1, correct: 0, completed: 0, briefedLevels: [],
      score: 0, levelScore: 0, streak: 0, bestStreak: 0, scoredQuestions: {}
    };
  }

  var progress = createProgressState();
  var phase = "question";
  var answeredCorrectly = false;
  var scoringQuestionKey = "";
  var questionStartedAt = 0;
  var retries = 0;
  var questionScore = 0;
  var scoreAwarded = false;
  var scoreBreakdown = [];
  var currentResponse = null;
  var currentRuntimeAttempts = 1;
  var currentDurationMs = 0;
  var currentQuestionReview = null;
  var attemptQuestionReviews = [];
  var completedAttempt = null;
  var historyReturnView = "game";
  var historyStorageWarning = "";
  var restoredQuestionElapsedMs = 0;
  var layer;
  var sceneOutcome;
  var gameMount;
  var controls;
  var sceneCheck;
  var simulationIcons = {
    friction: "▰",
    projectile: "➶",
    circuit: "ϟ",
    particles: "◉",
    ecosystem: "♧",
    energy: "▣",
    fluid: "◒",
    wave: "≋",
    optics: "✦",
    cell: "◎"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  function normalizeAnswer(value) {
    return String(value || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function answerHash(value) {
    return Array.from(String(value || "")).reduce(function (total, character) {
      return total + character.codePointAt(0);
    }, 0);
  }

  function currentIndex() {
    return ((progress.level - 1) * config.questionsPerLevel) + progress.question - 1;
  }

  function currentQuestion() {
    return config.questions[currentIndex()] || config.questions[0];
  }

  function formatScore(value) {
    return Math.max(0, Number(value) || 0).toLocaleString("es-MX");
  }

  var ATTEMPT_HISTORY_VERSION = 1;
  var ATTEMPT_HISTORY_LIMIT = 2;
  var ATTEMPT_PENALTY_FROM = 3;
  var ATTEMPT_PENALTY_RATE = .25;
  var ATTEMPT_HISTORY_PREFIX = "scienceActivities:attempt-history:v1:";
  var ACTIVE_ATTEMPT_VERSION = 1;
  var ACTIVE_ATTEMPT_PREFIX = "scienceActivities:active-attempt:v1:";

  function historyId() {
    return String(config.historyId || config.exportPackage && config.exportPackage.historyId || "").trim();
  }

  function historyStorageKey() {
    return ATTEMPT_HISTORY_PREFIX + historyId();
  }

  function activeAttemptStorageKey() {
    return ACTIVE_ATTEMPT_PREFIX + historyId();
  }

  function emptyAttemptHistory() {
    return { version: ATTEMPT_HISTORY_VERSION, historyId: historyId(), totalCompleted: 0, attempts: [] };
  }

  function normalizeStoredAttempt(attempt) {
    if (!attempt || typeof attempt !== "object" || !Array.isArray(attempt.questions)) return null;
    return {
      id: String(attempt.id || ""),
      number: Math.max(1, Math.floor(Number(attempt.number) || 1)),
      completedAt: String(attempt.completedAt || ""),
      rawScore: Math.max(0, Math.round(Number(attempt.rawScore) || 0)),
      penaltyRate: Math.max(0, Math.min(1, Number(attempt.penaltyRate) || 0)),
      score: Math.max(0, Math.round(Number(attempt.score) || 0)),
      accuracy: Math.max(0, Math.min(100, Math.round(Number(attempt.accuracy) || 0))),
      correct: Math.max(0, Math.floor(Number(attempt.correct) || 0)),
      totalQuestions: Math.max(0, Math.floor(Number(attempt.totalQuestions) || attempt.questions.length)),
      bestStreak: Math.max(0, Math.floor(Number(attempt.bestStreak) || 0)),
      questions: attempt.questions.slice(0, Math.max(1, config.questions.length)).filter(function (question) {
        return question && typeof question === "object";
      })
    };
  }

  function readAttemptHistory() {
    if (!historyId()) return emptyAttemptHistory();
    try {
      var parsed = JSON.parse(window.localStorage.getItem(historyStorageKey()) || "null");
      if (!parsed || parsed.version !== ATTEMPT_HISTORY_VERSION || parsed.historyId !== historyId()) return emptyAttemptHistory();
      return {
        version: ATTEMPT_HISTORY_VERSION,
        historyId: historyId(),
        totalCompleted: Math.max(0, Math.floor(Number(parsed.totalCompleted) || 0)),
        attempts: (Array.isArray(parsed.attempts) ? parsed.attempts : []).map(normalizeStoredAttempt).filter(Boolean).slice(-ATTEMPT_HISTORY_LIMIT)
      };
    } catch (error) {
      historyStorageWarning = "El navegador no permitió leer la bitácora local.";
      return emptyAttemptHistory();
    }
  }

  function writeAttemptHistory(history) {
    if (!historyId()) {
      historyStorageWarning = "Esta exportación no tiene un identificador de historial.";
      return false;
    }
    try {
      window.localStorage.setItem(historyStorageKey(), JSON.stringify(history));
      historyStorageWarning = "";
      return true;
    } catch (error) {
      historyStorageWarning = "No fue posible guardar la bitácora. Puedes continuar jugando, pero este intento podría perderse al cerrar la página.";
      return false;
    }
  }

  function persistActiveAttempt(savedPhase) {
    if (!historyId()) return false;
    var elapsedMs = questionStartedAt
      ? Math.max(0, performance.now() - questionStartedAt)
      : Math.max(0, currentDurationMs || 0);
    var snapshot = {
      version: ACTIVE_ATTEMPT_VERSION,
      historyId: historyId(),
      savedAt: new Date().toISOString(),
      phase: savedPhase || phase,
      progress: cloneSerializable(progress),
      answeredCorrectly: Boolean(answeredCorrectly),
      scoringQuestionKey: String(scoringQuestionKey || ""),
      questionElapsedMs: Math.round(elapsedMs),
      retries: Math.max(0, Math.floor(Number(retries) || 0)),
      questionScore: Math.max(0, Math.round(Number(questionScore) || 0)),
      scoreAwarded: Boolean(scoreAwarded),
      scoreBreakdown: cloneSerializable(scoreBreakdown),
      currentResponse: cloneSerializable(currentResponse),
      currentRuntimeAttempts: Math.max(1, Math.floor(Number(currentRuntimeAttempts) || 1)),
      currentDurationMs: Math.max(0, Math.round(Number(currentDurationMs) || 0)),
      currentQuestionReview: cloneSerializable(currentQuestionReview),
      attemptQuestionReviews: cloneSerializable(attemptQuestionReviews),
      completedAttempt: cloneSerializable(completedAttempt)
    };
    try {
      window.localStorage.setItem(activeAttemptStorageKey(), JSON.stringify(snapshot));
      return true;
    } catch (error) {
      historyStorageWarning = "No fue posible guardar el avance activo. Evita recargar la página hasta terminar el intento.";
      return false;
    }
  }

  function clearActiveAttempt() {
    if (!historyId()) return;
    try { window.localStorage.removeItem(activeAttemptStorageKey()); } catch (error) {
      historyStorageWarning = "El navegador no permitió reiniciar el avance activo.";
    }
  }

  function restoreActiveAttempt() {
    if (!historyId()) return false;
    try {
      var snapshot = JSON.parse(window.localStorage.getItem(activeAttemptStorageKey()) || "null");
      if (!snapshot || snapshot.version !== ACTIVE_ATTEMPT_VERSION || snapshot.historyId !== historyId()) return false;
      var restoredProgress = snapshot.progress;
      var level = Math.floor(Number(restoredProgress && restoredProgress.level));
      var question = Math.floor(Number(restoredProgress && restoredProgress.question));
      if (level < 1 || level > config.levelCount || question < 1 || question > config.questionsPerLevel) {
        clearActiveAttempt();
        return false;
      }
      progress = Object.assign(createProgressState(), restoredProgress, {
        level: level,
        question: question,
        briefedLevels: Array.isArray(restoredProgress.briefedLevels) ? restoredProgress.briefedLevels : [],
        scoredQuestions: restoredProgress.scoredQuestions && typeof restoredProgress.scoredQuestions === "object" ? restoredProgress.scoredQuestions : {}
      });
      phase = String(snapshot.phase || "briefing");
      answeredCorrectly = Boolean(snapshot.answeredCorrectly);
      scoringQuestionKey = String(snapshot.scoringQuestionKey || "");
      restoredQuestionElapsedMs = Math.max(0, Number(snapshot.questionElapsedMs) || 0);
      retries = Math.max(0, Math.floor(Number(snapshot.retries) || 0));
      questionScore = Math.max(0, Number(snapshot.questionScore) || 0);
      scoreAwarded = Boolean(snapshot.scoreAwarded);
      scoreBreakdown = Array.isArray(snapshot.scoreBreakdown) ? snapshot.scoreBreakdown : [];
      currentResponse = snapshot.currentResponse == null ? null : snapshot.currentResponse;
      currentRuntimeAttempts = Math.max(1, Math.floor(Number(snapshot.currentRuntimeAttempts) || 1));
      currentDurationMs = Math.max(0, Number(snapshot.currentDurationMs) || 0);
      currentQuestionReview = snapshot.currentQuestionReview || null;
      attemptQuestionReviews = Array.isArray(snapshot.attemptQuestionReviews) ? snapshot.attemptQuestionReviews : [];
      completedAttempt = snapshot.completedAttempt || null;
      return true;
    } catch (error) {
      clearActiveAttempt();
      return false;
    }
  }

  function bestActivityScore(history) {
    return (history.attempts || []).reduce(function (best, attempt) {
      return Math.max(best, Number(attempt.score) || 0);
    }, 0);
  }

  function cloneSerializable(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return String(value == null ? "" : value); }
  }

  function pointList(value) {
    return (Array.isArray(value) ? value : []).map(function (point) {
      return "(" + Number(point && point.x) + ", " + Number(point && point.y) + ")";
    }).join(" · ");
  }

  function timelineTitles(question, order) {
    var events = Array.isArray(question.events) ? question.events : [];
    return (Array.isArray(order) ? order : []).map(function (id) {
      var event = events.find(function (candidate) { return String(candidate.id) === String(id); });
      return event && event.title || String(id);
    });
  }

  function responseText(question, response) {
    if (response == null || response === "") return "Sin respuesta registrada";
    if (Array.isArray(response)) {
      if (response.length && response[0] && typeof response[0] === "object" && "left" in response[0]) {
        return response.map(function (pair) { return pair.left + " → " + pair.right; }).join(" · ");
      }
      if (response.length && response[0] && typeof response[0] === "object" && "x" in response[0]) return pointList(response);
      return response.map(String).join(" → ");
    }
    if (typeof response !== "object") return String(response);
    if (response.type === "graph-plot" || Array.isArray(response.points) && response.points.length) return pointList(response.points);
    if (response.type === "chemical-balance" || Array.isArray(response.coefficients) && response.coefficients.length) return response.coefficients.join(" : ");
    if (response.type === "exponent-placement" || response.exponent !== undefined && response.exponent !== "") return String(response.exponent || response.value || "Sin respuesta registrada");
    if (response.type === "timeline-order") return timelineTitles(question, response.sequence).join(" → ");
    if (Array.isArray(response.sequence) && response.sequence.length) return response.sequence.join(" → ");
    if (response.value !== undefined && response.value !== "") return String(response.value) + (question.unit ? " " + question.unit : "");
    if (Array.isArray(response.controls)) return response.controls.map(function (control) {
      return control.label + ": " + control.value + (control.unit ? " " + control.unit : "");
    }).join(" · ");
    return JSON.stringify(response);
  }

  function correctAnswerText(question) {
    if (!question) return "No disponible";
    if (question.type === "multiple" || question.type === "image-multiple") {
      var indexes = Array.isArray(question.correctAnswers) && question.correctAnswers.length ? question.correctAnswers : [question.correct];
      return indexes.map(function (index) { return question.options && question.options[Number(index)]; }).filter(Boolean).join(" · ");
    }
    if (question.type === "keyword" || question.type === "fill-blank") return (question.accepted || []).join(" / ");
    if (question.type === "matching") return (question.pairs || []).map(function (pair) { return pair[0] + " → " + pair[1]; }).join(" · ");
    if (question.type === "equation-build") return (question.correctSequence || []).join(" ");
    if (question.type === "exponent-placement") return (question.correctExponents || []).join(", ");
    if (question.type === "chemical-balance") return (question.correctCoefficients || []).join(" : ");
    if (question.type === "numeric-answer") return String(question.correctValue == null ? "" : question.correctValue) + (question.unit ? " " + question.unit : "");
    if (question.type === "number-line-placement") return String(question.targetValue == null ? question.correctValue : question.targetValue);
    if (question.type === "graph-plot") return pointList(question.targetPoints);
    if (question.type === "timeline-order") return timelineTitles(question, question.correctOrder).join(" → ");
    if (question.type === "sequence-order") return (question.correctOrder || []).join(" → ");
    return String(question.answer || question.solution || "No disponible");
  }

  function prepareQuestionReview(question, feedback) {
    currentQuestionReview = {
      index: currentIndex() + 1,
      level: progress.level,
      question: progress.question,
      type: String(question.type || "question"),
      prompt: String(question.prompt || ""),
      response: cloneSerializable(currentResponse),
      responseText: responseText(question, currentResponse),
      correctAnswer: correctAnswerText(question),
      correct: Boolean(answeredCorrectly),
      feedback: String(feedback || question.feedback || "Revisa la evidencia obtenida."),
      points: Math.max(0, Math.round(questionScore)),
      attempts: Math.max(1, Math.floor(Number(currentRuntimeAttempts) || 1)),
      durationMs: Math.max(0, Math.round(Number(currentDurationMs) || 0))
    };
  }

  function completedAttemptId(number) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    return "attempt-" + number + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function persistCompletedAttempt() {
    if (completedAttempt) return completedAttempt;
    var history = readAttemptHistory();
    var number = history.totalCompleted + 1;
    var penaltyRate = number >= ATTEMPT_PENALTY_FROM ? ATTEMPT_PENALTY_RATE : 0;
    var rawScore = Math.max(0, Math.round(progress.score));
    completedAttempt = {
      id: completedAttemptId(number),
      number: number,
      completedAt: new Date().toISOString(),
      rawScore: rawScore,
      penaltyRate: penaltyRate,
      score: Math.round(rawScore * (1 - penaltyRate)),
      accuracy: Math.round((progress.correct / Math.max(1, progress.completed)) * 100),
      correct: progress.correct,
      totalQuestions: progress.completed,
      bestStreak: progress.bestStreak,
      questions: cloneSerializable(attemptQuestionReviews)
    };
    history.totalCompleted = number;
    history.attempts = history.attempts.concat(completedAttempt).slice(-ATTEMPT_HISTORY_LIMIT);
    writeAttemptHistory(history);
    return completedAttempt;
  }

  function formatAttemptDate(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
    try {
      return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch (error) {
      return date.toLocaleString("es-MX");
    }
  }

  function historyRiveMarkup(className, role, label) {
    return "<span class=\"" + className + "\" data-science-rive-hud data-rive-role=\"" + role + "\" data-rive-artboard=\"New Artboard\" data-rive-state-machine=\"State Machine 1\" data-rive-fit=\"contain\" data-rive-static aria-hidden=\"true\"><canvas></canvas><i>" + escapeHtml(label || "LAB") + "</i></span>";
  }

  function questionReviewMarkup(review, index) {
    var panelId = "scienceHistoryQuestion-" + String(review.index || index + 1).replace(/[^a-z0-9_-]/gi, "-");
    var buttonId = panelId + "-button";
    var expanded = index === 0;
    return "<article class=\"science-history-question " + (review.correct ? "is-correct" : "is-incorrect") + "\">" +
      "<h3><button id=\"" + buttonId + "\" type=\"button\" data-history-question aria-expanded=\"" + String(expanded) + "\" aria-controls=\"" + panelId + "\">" +
      "<span><i aria-hidden=\"true\">" + (review.correct ? "✓" : "×") + "</i> Pregunta " + escapeHtml(review.index || index + 1) + "</span><b>" + formatScore(review.points) + " pts</b></button></h3>" +
      "<div id=\"" + panelId + "\" class=\"science-history-question-panel\" role=\"region\" aria-labelledby=\"" + buttonId + "\" " + (expanded ? "" : "hidden") + ">" +
      "<p class=\"science-history-prompt\">" + escapeHtml(review.prompt) + "</p>" +
      "<dl><div><dt>Tu respuesta</dt><dd>" + escapeHtml(review.responseText || "Sin respuesta registrada") + "</dd></div>" +
      "<div><dt>Respuesta correcta</dt><dd>" + escapeHtml(review.correctAnswer || "No disponible") + "</dd></div>" +
      "<div><dt>Retroalimentación</dt><dd>" + escapeHtml(review.feedback || "Sin retroalimentación") + "</dd></div></dl>" +
      "<footer>" + Math.max(1, Number(review.attempts) || 1) + " comprobación" + (Number(review.attempts) === 1 ? "" : "es") + "</footer></div></article>";
  }

  function renderAttemptHistory(preferredAttemptId, returnView) {
    var history = readAttemptHistory();
    var attempts = history.attempts.slice().reverse();
    var selected = attempts.find(function (attempt) { return attempt.id === preferredAttemptId; }) || attempts[0] || null;
    historyReturnView = returnView || historyReturnView || "game";
    phase = "history";
    setResultSurface(true);
    gameMount.classList.remove("science-result-correct", "science-result-incorrect", "is-level-briefing");
    gameMount.classList.add("science-history-active");
    sceneCheck.classList.remove("show");
    controls.classList.add("science-game-controls-hidden");
    layer.className = "science-assessment-layer is-result science-history-layer";
    if (window.ScienceRiveHud) window.ScienceRiveHud.destroyAll(layer);
    if (!selected) {
      layer.innerHTML = "<section class=\"science-history-book is-empty\" aria-labelledby=\"scienceHistoryTitle\" tabindex=\"-1\"><header class=\"science-history-header\">" + historyRiveMarkup("science-history-rive-core", "history-core", "00") + "<div class=\"science-history-heading\"><small>Mission data // Bitácora</small><h2 id=\"scienceHistoryTitle\">Todavía no hay intentos completos</h2><p>Completa todas las preguntas para guardar tu primera revisión.</p></div><div class=\"science-history-best\"><small>Estado</small><strong>Lista</strong><span>para registrar</span></div></header>" +
        (historyStorageWarning ? "<p class=\"science-history-warning\" role=\"status\">" + escapeHtml(historyStorageWarning) + "</p>" : "") +
        "<div class=\"science-history-actions\"><button type=\"button\" data-history-start>Comenzar actividad</button></div></section>";
    } else {
      var bestScore = bestActivityScore(history);
      var penalty = selected.penaltyRate > 0
        ? "<p class=\"science-history-penalty\"><strong>Penalización aplicada:</strong> score bruto " + formatScore(selected.rawScore) + " − 25% = " + formatScore(selected.score) + ".</p>"
        : "";
      layer.innerHTML = "<section class=\"science-history-book\" aria-labelledby=\"scienceHistoryTitle\" tabindex=\"-1\"><header class=\"science-history-header\">" + historyRiveMarkup("science-history-rive-core", "history-core", String(history.totalCompleted).padStart(2, "0")) + "<div class=\"science-history-heading\"><small>Mission data // Bitácora</small><h2 id=\"scienceHistoryTitle\">Centro de revisión</h2><p>" + history.totalCompleted + " intento" + (history.totalCompleted === 1 ? " completado" : "s completados") + " · Datos guardados en este navegador</p></div><div class=\"science-history-best\"><small>Mejor score</small><strong>" + formatScore(bestScore) + "</strong><span>puntos</span></div></header>" +
        (historyStorageWarning ? "<p class=\"science-history-warning\" role=\"status\">" + escapeHtml(historyStorageWarning) + "</p>" : "") +
        "<nav class=\"science-history-attempt-tabs\" aria-label=\"Intentos conservados\">" + attempts.map(function (attempt) {
          return "<button type=\"button\" data-history-attempt=\"" + escapeHtml(attempt.id) + "\" aria-pressed=\"" + String(attempt.id === selected.id) + "\">" + historyRiveMarkup("science-history-rive-signal", "history-attempt", "0" + attempt.number) + "<span>RUN " + String(attempt.number).padStart(2, "0") + "</span><strong>" + formatScore(attempt.score) + " pts</strong><small>" + escapeHtml(formatAttemptDate(attempt.completedAt)) + "</small></button>";
        }).join("") + "</nav>" +
        "<div class=\"science-history-summary\"><div><small>Score final</small><strong>" + formatScore(selected.score) + "</strong></div><div><small>Precisión</small><strong>" + selected.accuracy + "%</strong></div><div><small>Aciertos</small><strong>" + selected.correct + "/" + selected.totalQuestions + "</strong></div><div><small>Mejor racha</small><strong>" + selected.bestStreak + "</strong></div></div>" + penalty +
        "<div class=\"science-history-questions\">" + selected.questions.map(questionReviewMarkup).join("") + "</div>" +
        "<div class=\"science-history-actions\"><button class=\"is-secondary\" type=\"button\" data-history-back>" + (historyReturnView === "complete" && completedAttempt ? "Volver al resultado" : "Comenzar actividad") + "</button><button class=\"science-share-history\" type=\"button\" data-share-history>▣ Copiar bitácora</button><button class=\"is-danger\" type=\"button\" data-reset-history>Reiniciar intentos</button></div>" +
        "<div class=\"science-history-reset-confirm\" role=\"alertdialog\" aria-modal=\"true\" aria-labelledby=\"scienceResetTitle\" hidden><h3 id=\"scienceResetTitle\">¿Reiniciar todos los intentos?</h3><p>Se eliminarán las dos revisiones guardadas, el contador volverá a cero y el mejor score bajará de " + formatScore(bestScore) + " a 0. Esta acción no se puede deshacer.</p><div><button type=\"button\" data-cancel-reset>Cancelar</button><button class=\"is-danger\" type=\"button\" data-confirm-reset>Sí, reiniciar</button></div></div></section>";
    }
    window.requestAnimationFrame(function () {
      if (window.ScienceRiveHud) {
        window.ScienceRiveHud.mountAll(layer);
        var historyCore = layer.querySelector('[data-rive-role="history-core"]');
        var selectedSignal = layer.querySelector('[data-history-attempt][aria-pressed="true"] [data-rive-role="history-attempt"]');
        if (historyCore) window.ScienceRiveHud.setState(historyCore, "active");
        if (selectedSignal) window.ScienceRiveHud.setState(selectedSignal, "active");
      }
      var book = layer.querySelector(".science-history-book");
      if (book) book.focus({ preventScroll: true });
    });
  }

  function resetForNewAttempt() {
    clearActiveAttempt();
    progress = createProgressState();
    scoringQuestionKey = "";
    currentResponse = null;
    currentQuestionReview = null;
    attemptQuestionReviews = [];
    completedAttempt = null;
    gameMount.classList.remove("science-history-active");
    resetExperiment();
    renderLevelBriefing();
  }

  function renderRestoredAttempt() {
    if (phase === "complete" || phase === "level-complete") {
      renderLevelConclusion();
      return;
    }
    if (phase === "result" || phase === "experiment" && currentResponse != null) {
      phase = "experiment";
      revealResult();
      return;
    }
    if (phase === "question" || phase === "experiment") {
      startQuestionGame();
      return;
    }
    if (phase === "lab" || phase === "lab-running") {
      beginLabPractice();
      return;
    }
    renderLevelBriefing();
  }

  function beginQuestionAttempt() {
    var key = progress.level + ":" + progress.question;
    if (key !== scoringQuestionKey) {
      scoringQuestionKey = key;
      retries = 0;
      questionScore = 0;
      scoreAwarded = false;
      scoreBreakdown = [];
    }
    currentResponse = null;
    currentRuntimeAttempts = 1;
    currentDurationMs = 0;
    currentQuestionReview = null;
    questionStartedAt = performance.now() - restoredQuestionElapsedMs;
    restoredQuestionElapsedMs = 0;
  }

  function calculateQuestionScore() {
    if (scoreAwarded) return questionScore;
    scoreAwarded = true;
    questionScore = 0;
    scoreBreakdown = [];
    if (!answeredCorrectly) {
      progress.streak = 0;
      return 0;
    }
    if (progress.scoredQuestions[scoringQuestionKey]) {
      scoreBreakdown.push("Puntuación ya registrada");
      return 0;
    }
    progress.streak += 1;
    progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
    var configuredPoints = Math.max(0, Math.round(Number(currentQuestion().points) || 0));
    questionScore = configuredPoints;
    progress.score += questionScore;
    progress.levelScore += questionScore;
    progress.scoredQuestions[scoringQuestionKey] = questionScore;
    scoreBreakdown = ["Valor de la pregunta +" + configuredPoints];
    return questionScore;
  }

  function setControlsEnabled(enabled) {
    controls.querySelectorAll("button, input, select").forEach(function (control) {
      control.disabled = !enabled;
    });
  }

  function setResultSurface(active) {
    gameMount.classList.toggle("is-assessment-result", Boolean(active));
  }

  function resetExperiment() {
    var resetButton = controls.querySelector(".science-action.secondary");
    if (resetButton) resetButton.click();
  }

  function applyAnswerPreset(answerSeed, correct) {
    var seed = Math.max(1, Number(answerSeed) || 1);
    controls.querySelectorAll('input[type="range"]').forEach(function (input, index) {
      var minimum = Number(input.min || 0);
      var maximum = Number(input.max || 100);
      var steps = 9;
      var position = ((seed * (index + 3)) + (index * 2)) % steps;
      var ratio = correct ? .72 + (position / steps) * .22 : .08 + (position / steps) * .22;
      input.value = String(minimum + ((maximum - minimum) * ratio));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function progressMarkup() {
    var percentage = Math.round(((progress.question - 1) / config.questionsPerLevel) * 100);
    return "<div class=\"science-level-progress\">" +
      "<div><strong>Nivel " + progress.level + " de " + config.levelCount + "</strong>" +
      "<span>" + (isLabMode ? "Práctica experimental" : "Pregunta " + progress.question + " de " + config.questionsPerLevel) + "</span></div>" +
      "<i><span style=\"width:" + percentage + "%\"></span></i></div>";
  }

  function limitLearningText(value, maxWords, maxCharacters) {
    var normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized;
  }

  function completeLearningTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function difficultyExampleMarkup(level) {
    var difficulty = config.difficulty || "balanced";
    var concepts = level.concepts || [];
    var first = concepts[0] && concepts[0].term || "el concepto principal";
    var second = concepts[1] && concepts[1].term || "la variable observada";
    var examples = {
      guided: ["Ejemplo básico", "Observa " + first + ". Modifica una sola variable y describe con tus palabras qué cambia en " + second + "."],
      balanced: ["Ejemplo aplicado", "Compara " + first + " con " + second + ": predice el resultado, cambia una variable y contrasta tu predicción con la evidencia."],
      challenge: ["Ejemplo complejo", "Relaciona " + first + " y " + second + ", predice el resultado de dos cambios simultáneos y justifica qué variable tuvo mayor efecto."]
    };
    var fallback = examples[difficulty] || examples.balanced;
    var generated = level.example && typeof level.example === "object" ? level.example : null;
    var title = generated && generated.title || fallback[0];
    var rawExample = generated && generated.text ||
      [generated && generated.situation, generated && generated.result].filter(Boolean).join(" ") ||
      (typeof level.example === "string" ? level.example : fallback[1]);
    var conciseExample = rawExample.length > 240
      ? rawExample.slice(0, 237).replace(/\s+\S*$/, "") + "…"
      : rawExample;
    return "<div class=\"science-difficulty-example\" data-difficulty=\"" + escapeHtml(difficulty) + "\"><i>⚗</i><strong>" +
      escapeHtml(title) + "</strong><span>" + escapeHtml(conciseExample) + "</span></div>";
  }

  function experienceBriefingCarouselMarkup() {
    var objective = safeGeneratedText(config.experiencePrompt) || config.mission;
    var slides = [
      ["Objetivo del juego", objective],
      [config.subject === "math" ? "Principio matemático" : "Principio científico", config.scientificPrinciple]
    ];
    return "<section class=\"science-experience-briefing\" data-experience-carousel role=\"region\" aria-roledescription=\"carrusel\" aria-label=\"Objetivo y principio del juego\" tabindex=\"0\">" +
      "<div class=\"science-experience-carousel-track\">" + slides.map(function (slide, index) {
        return "<article data-experience-slide role=\"group\" aria-roledescription=\"diapositiva\" aria-label=\"" + (index + 1) + " de " + slides.length + "\"" + (index ? " hidden" : "") + "><small>" + escapeHtml(slide[0]) + "</small><p>" + escapeHtml(slide[1]) + "</p></article>";
      }).join("") + "</div><nav class=\"science-experience-carousel-controls\" aria-label=\"Navegación de la misión\">" +
      "<button type=\"button\" data-experience-prev aria-label=\"Ver información anterior\"><span aria-hidden=\"true\">‹</span></button>" +
      "<div class=\"science-experience-carousel-dots\" role=\"tablist\" aria-label=\"Secciones de la misión\">" + slides.map(function (slide, index) {
        return "<button type=\"button\" role=\"tab\" data-experience-dot=\"" + index + "\" aria-label=\"" + escapeHtml(slide[0]) + "\" aria-selected=\"" + (index === 0) + "\"></button>";
      }).join("") + "</div><span data-experience-status aria-live=\"polite\">1 de " + slides.length + "</span>" +
      "<button type=\"button\" data-experience-next aria-label=\"Ver información siguiente\"><span aria-hidden=\"true\">›</span></button></nav></section>";
  }

  function initializeExperienceBriefingCarousel(root) {
    var carousel = root && root.querySelector("[data-experience-carousel]");
    if (!carousel || carousel.dataset.carouselReady === "true") return;
    var slides = Array.from(carousel.querySelectorAll("[data-experience-slide]"));
    var dots = Array.from(carousel.querySelectorAll("[data-experience-dot]"));
    var status = carousel.querySelector("[data-experience-status]");
    var activeIndex = 0;
    function show(requestedIndex, focusDot) {
      activeIndex = (requestedIndex + slides.length) % slides.length;
      slides.forEach(function (slide, index) { slide.hidden = index !== activeIndex; });
      dots.forEach(function (dot, index) {
        dot.setAttribute("aria-selected", String(index === activeIndex));
        dot.tabIndex = index === activeIndex ? 0 : -1;
      });
      if (status) status.textContent = (activeIndex + 1) + " de " + slides.length;
      if (focusDot && dots[activeIndex]) dots[activeIndex].focus();
    }
    carousel.querySelector("[data-experience-prev]").addEventListener("click", function () { show(activeIndex - 1); });
    carousel.querySelector("[data-experience-next]").addEventListener("click", function () { show(activeIndex + 1); });
    dots.forEach(function (dot, index) { dot.addEventListener("click", function () { show(index); }); });
    carousel.addEventListener("keydown", function (event) {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
      event.preventDefault();
      if (event.key === "Home") show(0, true);
      else if (event.key === "End") show(slides.length - 1, true);
      else show(activeIndex + (event.key === "ArrowRight" ? 1 : -1), true);
    });
    carousel.dataset.carouselReady = "true";
    show(0, false);
  }

  function installResponsiveIntroductionLayout(frame, briefing) {
    if (frame.__scienceIntroductionResizeObserver) frame.__scienceIntroductionResizeObserver.disconnect();
    var rootRules = [
      ["display", "flex"], ["flex-direction", "column"], ["align-items", "stretch"],
      ["grid-template-columns", "minmax(0, 1fr)"], ["grid-template-rows", "auto auto"],
      ["position", "relative"], ["inset", "auto"], ["width", "100%"],
      ["height", "auto"], ["min-height", "100%"], ["max-height", "none"], ["overflow", "visible"]
    ];
    var childRules = [
      ["position", "relative"], ["inset", "auto"], ["grid-column", "1"],
      ["grid-row", "auto"], ["width", "100%"], ["max-width", "none"]
    ];
    function setRules(element, rules, active) {
      if (!element) return;
      rules.forEach(function (rule) {
        if (active) element.style.setProperty(rule[0], rule[1], "important");
        else element.style.removeProperty(rule[0]);
      });
    }
    function sync() {
      var narrow = frame.getBoundingClientRect().width <= 820;
      var visual = briefing.querySelector(":scope > .science-micro-visual");
      var content = briefing.querySelector(":scope > .science-micro-content");
      briefing.classList.toggle("is-stacked-introduction", narrow);
      setRules(briefing, rootRules, narrow);
      setRules(visual, childRules, narrow);
      setRules(content, childRules, narrow);
      setRules(content, [["height", "auto"], ["min-height", "0"], ["overflow", "visible"], ["flex", "0 0 auto"]], narrow);
      setRules(visual, [["height", "clamp(240px, 58cqi, 440px)"], ["min-height", "240px"], ["max-height", "none"], ["flex", "0 0 auto"]], narrow);
      setRules(briefing.querySelector(".science-micro-concepts"), [["grid-template-columns", "minmax(0, 1fr)"]], narrow);
      briefing.querySelectorAll(".science-experience-briefing,.science-experience-carousel-track,.science-experience-carousel-track article").forEach(function (element) {
        setRules(element, [["position", "relative"], ["inset", "auto"], ["height", "auto"], ["min-height", "0"], ["max-height", "none"], ["overflow", "visible"]], narrow);
      });
    }
    if (typeof ResizeObserver === "function") {
      frame.__scienceIntroductionResizeObserver = new ResizeObserver(sync);
      frame.__scienceIntroductionResizeObserver.observe(frame);
    }
    sync();
    window.requestAnimationFrame(sync);
  }

  function renderLevelBriefing() {
    setResultSurface(false);
    if (progress.briefedLevels.indexOf(progress.level) >= 0) {
      if (isLabMode) beginLabPractice();
      else startQuestionGame();
      return;
    }
    var guide = config.learningGuide || {};
    var level = (guide.levels || [])[progress.level - 1] || {
      title: "Misión científica",
      narrative: guide.introduction || "Observa los conceptos antes de experimentar.",
      objective: "Comprender las variables principales.",
      concepts: [],
      hint: "Cambia una variable a la vez."
    };
    var imageSource = level.imageSrc || level.imageDataUrl || level.imageUrl || "";
    var image = imageSource
      ? "<img class=\"science-level-hero\" src=\"" + escapeHtml(imageSource) + "\" alt=\"Ilustración de " + escapeHtml(level.title) + "\">"
      : "<div class=\"science-level-fallback\">⚛<span>" + escapeHtml(level.title) + "</span></div>";
    var concepts = (level.concepts || []).filter(function (concept) {
      return concept && concept.term && concept.definition;
    }).slice(0, 2);
    var generatedExample = level.example && typeof level.example === "object" ? level.example : null;
    var practicalExample = generatedExample && generatedExample.text ||
      [generatedExample && generatedExample.situation, generatedExample && generatedExample.result].filter(Boolean).join(" ") ||
      (typeof level.example === "string" ? level.example : "") ||
      level.hint ||
      "Observa " + (concepts[0] && concepts[0].term || config.topic) + " en una situación cotidiana y predice qué ocurrirá.";
    var exampleFormula = String(generatedExample && generatedExample.formula || "").trim();
    var exampleGuidance = String(generatedExample && generatedExample.explanation || "").trim();
    var exampleTitle = String(generatedExample && generatedExample.title || "Ejemplo aplicado").trim();
    var microLevelConcepts = concepts.map(function (concept) {
      return String(concept && concept.term || "").trim();
    }).filter(function (term, index, all) {
      return term && all.findIndex(function (item) { return String(item).trim().toLocaleLowerCase("es") === term.toLocaleLowerCase("es"); }) === index;
    }).slice(0, 2);
    var microLevelTitle = microLevelConcepts.length
      ? config.topic + ": " + microLevelConcepts.join(" y ")
      : level.objective || level.title || config.topic + " · Etapa " + progress.level;
    var experienceBriefing = progress.level === 1 ? experienceBriefingCarouselMarkup() : "";
    phase = "briefing";
    gameMount.classList.add("is-level-briefing");
    layer.className = "science-rive-briefing-screen science-micro-mission";
    layer.innerHTML = "<div class=\"science-micro-visual\">" + image +
      "<div class=\"science-micro-level\"><span>Etapa " + progress.level + " de " + config.levelCount + "</span><strong>" + escapeHtml(completeLearningTitle(microLevelTitle)) + "</strong></div></div>" +
      "<div class=\"science-micro-content\">" + progressMarkup() +
      "<div class=\"science-micro-kicker\"><span>Micro-misión</span><b>" + progress.question + "/" + config.questionsPerLevel + "</b></div>" +
      experienceBriefing +
      "<h2>" + escapeHtml(completeLearningTitle(level.objective || config.mission)) + "</h2>" +
      "<div class=\"science-micro-concepts\">" + concepts.map(function (concept, index) {
        return "<div class=\"science-micro-concept\"><span>0" + (index + 1) + "</span><p><strong>" +
          escapeHtml(completeLearningTitle(concept.term)) + "</strong>" +
          escapeHtml(limitLearningText(concept.definition, 16, 112)) + "</p></div>";
      }).join("") + "</div>" +
      "<div class=\"science-micro-example\"><span><small>" + escapeHtml(exampleTitle) + "</small><strong>" +
      escapeHtml(practicalExample) + "</strong>" +
      (exampleFormula ? "<em class=\"science-micro-formula\"><b>Aplicado a este caso</b><code>" + escapeHtml(exampleFormula) + "</code></em>" : "") +
      (exampleGuidance ? "<p class=\"science-micro-example-guidance\">" + escapeHtml(exampleGuidance) + "</p>" : "") +
      "</span></div>" +
      "<button class=\"science-start-level science-micro-launch\" type=\"button\" data-start-level><span>" +
      (isLabMode ? "Abrir práctica" : "Iniciar la Actividad") + "</span><i aria-hidden=\"true\">→</i></button>" +
      "</div>";
    installResponsiveIntroductionLayout(gameMount, layer);
    initializeExperienceBriefingCarousel(layer);
    window.requestAnimationFrame(function () {
      if (window.ScienceRiveHud) window.ScienceRiveHud.mountAll(layer);
    });
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
    persistActiveAttempt("briefing");
  }

  function answerMarkup(question) {
    if (question.type === "multiple" || question.type === "image-multiple") {
      var imageSource = question.visual && (question.visual.imageSrc || question.visual.imageUrl || question.visual.imageDataUrl) || "";
      var visualMarkup = question.type === "image-multiple"
        ? "<figure class=\"science-image-question " + (imageSource ? "" : "is-missing") + "\">" + (imageSource ? "<img src=\"" + escapeHtml(imageSource) + "\" alt=\"" + escapeHtml(question.visual && question.visual.alt || "Ilustración científica con un elemento señalado") + "\">" : "<figcaption>No se pudo cargar la imagen necesaria para responder.</figcaption>") + "</figure>"
        : "";
      return visualMarkup + "<div class=\"science-answer-options\">" + question.options.map(function (option, index) {
        return "<button class=\"science-rive-answer-card\" type=\"button\" data-answer=\"" + index +
          "\"><i class=\"science-rive-answer-surface\" data-science-rive-hud data-rive-artboard=\"New Artboard\" data-rive-state-machine=\"State Machine 1\" data-rive-fit=\"contain\" aria-hidden=\"true\"><canvas></canvas></i><span class=\"science-rive-answer-badge\">" +
          String.fromCharCode(65 + index) + "</span><strong>" + escapeHtml(option) +
          "</strong><small>Probar esta hipótesis</small></button>";
      }).join("") + "</div>";
    }
    if (question.type === "keyword") {
      return "<form class=\"science-keyword-form\"><label>Palabra clave</label><div>" +
        "<input autocomplete=\"off\" placeholder=\"Escribe tu respuesta…\" required>" +
        "<button type=\"button\" data-submit-assessment>Registrar hipótesis</button></div></form>";
    }
    var definitions = question.pairs.map(function (pair) { return pair[1]; });
    return "<form class=\"science-matching-form\">" + question.pairs.map(function (pair) {
      return "<label><span>" + escapeHtml(pair[0]) + "</span><select required>" +
        "<option value=\"\">Selecciona…</option>" + definitions.map(function (definition) {
          return "<option value=\"" + escapeHtml(definition) + "\">" + escapeHtml(definition) + "</option>";
        }).join("") + "</select></label>";
    }).join("") + "<button type=\"button\" data-submit-assessment>Registrar relaciones</button></form>";
  }

  function renderAccessibleQuestion() {
    setResultSurface(false);
    gameMount.classList.remove("is-level-briefing");
    var question = currentQuestion();
    phase = "question";
    gameMount.classList.remove("science-result-correct", "science-result-incorrect");
    layer.className = "science-assessment-layer";
    layer.innerHTML = "<div class=\"science-question-world\" aria-hidden=\"true\"><i></i><i></i><i></i></div>" +
      "<div class=\"science-question-card\" data-question-type=\"" + escapeHtml(question.type) + "\">" +
      "<div class=\"science-question-badge\">" + (simulationIcons[config.simulationType] || "✦") + " Pregunta " + progress.question + "</div>" +
      progressMarkup() +
      "<small>" + (question.type === "image-multiple" ? "Imagen señalada" : question.type === "multiple" ? "Opción múltiple" : question.type === "matching" ? "Emparejamiento" : "Palabra clave") + "</small>" +
      "<h2>" + escapeHtml(completeLearningTitle(question.prompt)) + "</h2>" +
      "<p>Elige tu hipótesis.</p>" +
      answerMarkup(question) + "</div>";
    window.requestAnimationFrame(function () {
      if (window.ScienceRiveHud) window.ScienceRiveHud.mountAll(layer);
    });
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
    persistActiveAttempt("question");
  }

  function startQuestionGame() {
    beginQuestionAttempt();
    setResultSurface(false);
    gameMount.classList.remove("is-level-briefing");
    if (window.ScienceRiveHud) window.ScienceRiveHud.destroyAll(layer);
    var question = currentQuestion();
    phase = "experiment";
    layer.className = "science-assessment-layer is-hidden";
    gameMount.classList.remove("science-result-correct", "science-result-incorrect", "science-experiment-success", "science-experiment-failed");
    gameMount.classList.add("science-experiment-active");
    setControlsEnabled(false);
    var run = globalThis.scienceGameInstance && globalThis.scienceGameInstance.playQuestionGame
      ? globalThis.scienceGameInstance.playQuestionGame({
        assessment: question,
        profile: question.gameplay || question.animation || {},
        gameplay: question.gameplay || {},
        subject: config.subject,
        topic: config.topic,
        simulationType: config.simulationType,
        difficulty: config.difficulty,
        controls: config.controls,
        visualStyle: config.visualStyle,
        progress: { level: progress.level, totalLevels: config.levelCount, question: progress.question, questionsPerLevel: config.questionsPerLevel }
      })
      : null;
    if (!run) {
      phase = "question";
      gameMount.classList.remove("science-experiment-active");
      renderAccessibleQuestion();
      return;
    }
    persistActiveAttempt("question");
    Promise.resolve(run).then(function (result) {
      if (result && result.cancelled || phase !== "experiment") return;
      answeredCorrectly = Boolean(result && result.correct);
      currentResponse = result && result.response;
      currentRuntimeAttempts = Math.max(1, Number(result && result.attempts) || 1);
      currentDurationMs = Math.max(0, Number(result && result.durationMs) || performance.now() - questionStartedAt);
      revealResult();
    });
  }

  function beginLabPractice() {
    beginQuestionAttempt();
    setResultSurface(false);
    gameMount.classList.remove("is-level-briefing");
    if (window.ScienceRiveHud) window.ScienceRiveHud.destroyAll(layer);
    phase = "lab";
    answeredCorrectly = false;
    layer.classList.add("is-hidden");
    controls.classList.remove("science-game-controls-hidden");
    setControlsEnabled(true);
    sceneOutcome.classList.remove("show");
    sceneCheck.disabled = false;
    sceneCheck.innerHTML = "⚗ <span>Comprobar práctica</span>";
    sceneCheck.classList.add("show");
    gameMount.classList.remove("science-result-correct", "science-result-incorrect", "science-experiment-success", "science-experiment-failed");
    persistActiveAttempt("lab");
  }

  function validateLabPractice() {
    if (phase !== "lab") return;
    var target = Number(config.challenge && config.challenge.targetValue != null ? config.challenge.targetValue : 50);
    var tolerance = Math.max(0, Number(config.challenge && config.challenge.tolerance != null ? config.challenge.tolerance : 5));
    var ranges = Array.from(controls.querySelectorAll('input[type="range"]'));
    var normalizedTargetLabel = normalizeAnswer(config.challenge && config.challenge.targetLabel);
    var targetControlIndex = (config.controls || []).findIndex(function (control) {
      var label = normalizeAnswer(control.label);
      return label === normalizedTargetLabel || label.indexOf(normalizedTargetLabel) >= 0 || normalizedTargetLabel.indexOf(label) >= 0;
    });
    var testedRange = ranges[targetControlIndex] || ranges.find(function (input) {
      return target >= Number(input.min) && target <= Number(input.max);
    }) || ranges[0];
    var testedValue = Number(testedRange ? testedRange.value : Number.NaN);
    answeredCorrectly = Number.isFinite(testedValue) && Math.abs(testedValue - target) <= tolerance;
    currentResponse = {
      type: "lab",
      controls: ranges.map(function (input, index) {
        var control = (config.controls || [])[index] || {};
        return { label: control.label || input.name || "Variable " + (index + 1), value: input.value, unit: control.unit || "" };
      })
    };
    currentRuntimeAttempts = 1;
    currentDurationMs = Math.max(0, performance.now() - questionStartedAt);
    phase = "lab-running";
    sceneCheck.disabled = true;
    sceneCheck.classList.remove("show");
    var action = controls.querySelector(".science-action:not(.secondary)");
    if (action) action.click();
    gameMount.classList.add("science-experiment-active");
    window.setTimeout(function () {
      phase = "experiment";
      gameMount.classList.add(answeredCorrectly ? "science-experiment-success" : "science-experiment-failed");
      revealResult();
    }, 1400);
  }

  function beginExperiment(correct, answerSeed, response, attempts, durationMs) {
    answeredCorrectly = correct;
    currentResponse = response;
    currentRuntimeAttempts = Math.max(1, Number(attempts) || 1);
    currentDurationMs = Math.max(0, Number(durationMs) || performance.now() - questionStartedAt);
    phase = "experiment";
    applyAnswerPreset(answerSeed, correct);
    layer.classList.add("is-hidden");
    gameMount.classList.remove("science-experiment-success", "science-experiment-failed");
    gameMount.classList.add("science-experiment-active");
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    setControlsEnabled(false);
    persistActiveAttempt("experiment");
    window.setTimeout(revealResult, 260);
  }

  function revealResult() {
    if (phase !== "experiment") return;
    calculateQuestionScore();
    var question = currentQuestion();
    var labFeedbackRaw = answeredCorrectly
      ? "La práctica alcanzó " + String(config.challenge && config.challenge.targetLabel || "el objetivo experimental") + " dentro de la tolerancia permitida."
      : "La prueba quedó fuera del objetivo. Ajusta las variables para aproximarte a " +
        String(config.challenge && config.challenge.targetValue != null ? config.challenge.targetValue : "el valor indicado") +
        " ± " + String(config.challenge && config.challenge.tolerance != null ? config.challenge.tolerance : 5) + ".";
    var labFeedback = escapeHtml(labFeedbackRaw);
    prepareQuestionReview(question, isLabMode ? labFeedbackRaw : question.feedback);
    phase = "result";
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    gameMount.classList.remove("science-experiment-active", "science-experiment-success", "science-experiment-failed");
    gameMount.classList.add(answeredCorrectly ? "science-result-correct" : "science-result-incorrect");
    setResultSurface(true);
    layer.className = "science-assessment-layer is-result " + (answeredCorrectly ? "is-correct" : "is-incorrect");
    layer.innerHTML = "<article class=\"science-rive-result-screen\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"scienceResultTitle\" tabindex=\"-1\">" +
      "<div class=\"science-rive-result-content\">" + progressMarkup() +
      "<small>" + (isLabMode ? (answeredCorrectly ? "Práctica correcta" : "Práctica por corregir") : (answeredCorrectly ? "Hipótesis confirmada" : "Hipótesis por revisar")) + "</small>" +
      "<h2 id=\"scienceResultTitle\">" + (isLabMode ? (answeredCorrectly ? "¡Procedimiento validado!" : "La configuración no alcanzó el objetivo") : (answeredCorrectly ? "¡La evidencia coincide!" : "El experimento mostró otra relación")) + "</h2>" +
      "<p>" + (isLabMode ? labFeedback : escapeHtml(question.feedback || "Revisa la evidencia obtenida antes de continuar.")) + "</p>" +
      "<div class=\"science-rive-result-proof " + (answeredCorrectly ? "is-positive" : "is-zero") + "\"><i>" + (answeredCorrectly ? "⚡" : "→") + "</i><span><small>" + (answeredCorrectly ? "Puntos obtenidos" : "Racha reiniciada") + "</small><strong>" + (answeredCorrectly ? "+" + formatScore(questionScore) : "0 puntos") + "</strong></span><em>" + escapeHtml(scoreBreakdown.join(" · ") || (answeredCorrectly ? "Acierto confirmado" : "Revisa la evidencia y continúa")) + "</em></div>" +
      "<div class=\"science-result-actions science-rive-result-actions\"><button type=\"button\" data-continue>→ " +
      (isLabMode ? "Concluir práctica" : (progress.question === config.questionsPerLevel ? "Concluir nivel" : "Siguiente pregunta")) +
      "</button></div></div></article>";
    window.requestAnimationFrame(function () {
      var resultScreen = layer.querySelector(".science-rive-result-screen");
      if (resultScreen) resultScreen.focus({ preventScroll: true });
    });
    persistActiveAttempt("result");
  }

  function renderLevelConclusion() {
    var isLast = progress.level >= config.levelCount;
    var total = config.levelCount * config.questionsPerLevel;
    var accuracy = Math.round((progress.correct / Math.max(1, progress.completed)) * 100);
    var rank = accuracy >= 90 ? "Investigador élite" : accuracy >= 75 ? "Analista científico" : accuracy >= 60 ? "Explorador de laboratorio" : "Aprendiz científico";
    var starCount = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1;
    var attempt = isLast ? persistCompletedAttempt() : null;
    var displayedScore = attempt ? attempt.score : progress.score;
    var history = readAttemptHistory();
    var nextAttemptNumber = history.totalCompleted + 1;
    var penaltyNotice = isLast && nextAttemptNumber >= ATTEMPT_PENALTY_FROM
      ? "<p class=\"science-completion-penalty\" role=\"note\"><strong>Próximo intento:</strong> se aplicará una penalización del 25% al score final.</p>"
      : "";
    phase = isLast ? "complete" : "level-complete";
    gameMount.classList.remove("science-result-incorrect");
    gameMount.classList.add("science-result-correct");
    setResultSurface(true);
    layer.className = "science-assessment-layer is-result is-correct";
    layer.innerHTML = "<div class=\"science-question-card science-result-card science-level-complete science-level-complete-card\">" +
      "<div class=\"science-stars science-level-stars\">" + [1, 2, 3].map(function (star) { return "<span class=\"" + (star <= starCount ? "is-active" : "") + "\">★</span>"; }).join("") + "</div>" +
      "<small>" + (isLast ? "Juego concluido" : "Nivel " + progress.level + " superado") + "</small>" +
      "<h2>" + (isLast ? "¡Misión científica completada!" : (isLabMode ? "Práctica de laboratorio completada" : "Todas las preguntas fueron experimentadas")) + "</h2>" +
      "<p>" + (isLast
        ? (isLabMode ? "Completaste " + config.levelCount + " prácticas y validaste " + progress.correct + " procedimientos." : "Completaste " + total + " preguntas y confirmaste " + progress.correct + " hipótesis.")
        : (isLabMode ? "Concluiste la práctica. El siguiente nivel presenta un nuevo procedimiento experimental." : "Concluiste las " + config.questionsPerLevel + " preguntas. Ya puedes avanzar al siguiente nivel.")) +
      "</p><div class=\"science-score-summary\">" +
      "<div><small>Score final</small><strong>" + formatScore(displayedScore) + "</strong></div>" +
      "<div><small>Puntos del nivel</small><strong>" + formatScore(progress.levelScore) + "</strong></div>" +
      "<div><small>Precisión</small><strong>" + accuracy + "%</strong></div>" +
      "<div><small>Mejor racha</small><strong>" + progress.bestStreak + "</strong></div></div>" +
      "<div class=\"science-player-rank\"><span aria-hidden=\"true\"><svg viewBox=\"0 0 32 32\" focusable=\"false\"><path d=\"M8 2h6l2 8-6 4L8 2Zm16 0h-6l-2 8 6 4 2-12Z\"/><circle cx=\"16\" cy=\"20\" r=\"9\"/><path d=\"m16 14 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L16 14Z\" fill=\"#fff\"/></svg></span><div><small>Rango científico</small><strong>" + escapeHtml(rank) + "</strong></div></div>" +
      (attempt && attempt.penaltyRate ? "<p class=\"science-completion-penalty is-applied\"><strong>Penalización aplicada:</strong> " + formatScore(attempt.rawScore) + " − 25% = " + formatScore(attempt.score) + " puntos.</p>" : "") + penaltyNotice +
      (historyStorageWarning ? "<p class=\"science-history-warning\" role=\"status\">" + escapeHtml(historyStorageWarning) + "</p>" : "") +
      "<div class=\"science-result-actions science-completion-actions\"><button class=\"science-share-result\" type=\"button\" data-share-result>▣ Copiar captura</button>" +
      (isLast ? "<button type=\"button\" data-review-current>Revisar este intento</button><button type=\"button\" data-open-history>Ver bitácora</button>" : "") + "<button type=\"button\" " +
      (isLast ? "data-restart-game" : "data-next-level") + ">" +
      (isLast ? "↻ Jugar de nuevo" : "⚑ Comenzar nivel " + (progress.level + 1)) +
      "</button></div></div>";
    persistActiveAttempt(isLast ? "complete" : "level-complete");
  }

  async function captureElementToPng(source, options) {
    options = options || {};
    if (!(source instanceof Element)) throw new Error("No se encontró el contenido que se debe capturar.");
    var html2canvas = globalThis.__SCIENCE_HTML2CANVAS__;
    if (typeof html2canvas !== "function") throw new Error("El módulo de captura no está disponible en este ZIP.");
    var captureId = "capture-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    var previousCaptureId = source.dataset.scienceCaptureId;
    var revealed = options.revealSelector ? Array.from(source.querySelectorAll(options.revealSelector)).map(function (node) {
      return { node: node, hidden: node.hidden, style: node.getAttribute("style") };
    }) : [];
    source.dataset.scienceCaptureId = captureId;
    revealed.forEach(function (entry) {
      entry.node.hidden = false;
      entry.node.removeAttribute("hidden");
      entry.node.style.setProperty("display", "block", "important");
    });
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var bounds = source.getBoundingClientRect();
      var width = Math.max(1, Math.ceil(Math.max(bounds.width, source.scrollWidth)));
      var height = Math.max(1, Math.ceil(Math.max(bounds.height, source.scrollHeight)));
      var scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(16000000 / (width * height))));
      var canvas = await html2canvas(source, {
        backgroundColor: null,
        logging: false,
        scale: scale,
        useCORS: true,
        width: width,
        height: height,
        windowWidth: Math.max(document.documentElement.clientWidth, width),
        windowHeight: Math.max(document.documentElement.clientHeight, height),
        onclone: function (clonedDocument) {
          var clonedSource = clonedDocument.querySelector('[data-science-capture-id="' + captureId + '"]');
          if (!clonedSource) return;
          [clonedSource].concat(Array.from(clonedSource.querySelectorAll("*"))).forEach(function (node) {
            node.style.setProperty("animation", "none", "important");
            node.style.setProperty("transition", "none", "important");
          });
          if (options.normalizeResult) {
            clonedSource.style.setProperty("background", "linear-gradient(145deg,#f8fcfd,#eef6f8)", "important");
            clonedSource.style.setProperty("color", "#17354a", "important");
            clonedSource.querySelectorAll("h1,h2,h3,strong,b").forEach(function (node) {
              node.style.setProperty("color", "#17354a", "important");
              node.style.setProperty("-webkit-text-fill-color", "#17354a", "important");
            });
            clonedSource.querySelectorAll("p,small,em").forEach(function (node) {
              node.style.setProperty("color", "#587281", "important");
              node.style.setProperty("-webkit-text-fill-color", "#587281", "important");
            });
            clonedSource.querySelectorAll(".science-score-summary>div,.science-player-rank").forEach(function (node) {
              node.style.setProperty("background", "#e8f3f5", "important");
              node.style.setProperty("border-color", "#b8d5dc", "important");
            });
            clonedSource.querySelectorAll(".science-level-stars span").forEach(function (node) { node.style.setProperty("color", "#cbd8d5", "important"); });
            clonedSource.querySelectorAll(".science-level-stars .is-active").forEach(function (node) { node.style.setProperty("color", "#a6df32", "important"); });
          }
          if (options.excludeSelector) clonedSource.querySelectorAll(options.excludeSelector).forEach(function (node) { node.remove(); });
        }
      });
      return await new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("No fue posible crear la captura PNG.")); }, "image/png");
      });
    } finally {
      if (previousCaptureId) source.dataset.scienceCaptureId = previousCaptureId;
      else delete source.dataset.scienceCaptureId;
      revealed.forEach(function (entry) {
        entry.node.hidden = entry.hidden;
        if (entry.style == null) entry.node.removeAttribute("style");
        else entry.node.setAttribute("style", entry.style);
      });
    }
  }

  async function copyElementCapture(source, filename, options) {
    var blobPromise = captureElementToPng(source, options);
    if (typeof globalThis.__SCIENCE_WRITE_CAPTURE__ === "function") {
      await globalThis.__SCIENCE_WRITE_CAPTURE__(blobPromise);
      return "copied";
    }
    if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([new globalThis.ClipboardItem({ "image/png": blobPromise })]);
        return "copied";
      } catch (_) { /* file:// o permisos del navegador pueden bloquear el portapapeles. */ }
    }
    var blob = await blobPromise;
    var download = document.createElement("a");
    download.href = URL.createObjectURL(blob);
    download.download = filename;
    download.click();
    window.setTimeout(function () { URL.revokeObjectURL(download.href); }, 1500);
    return "downloaded";
  }

  async function copyVisiblePanel(button, source, filename, options) {
    var original = button.textContent;
    try {
      button.disabled = true;
      button.textContent = "Copiando captura…";
      var outcome = await copyElementCapture(source, filename, options);
      button.textContent = outcome === "copied" ? "Captura copiada ✓" : "PNG descargado ✓";
      await new Promise(function (resolve) { window.setTimeout(resolve, 1100); });
    } catch (error) {
      globalThis.__SCIENCE_CAPTURE_LAST_ERROR__ = error && error.message ? error.message : String(error || "Error desconocido");
      button.textContent = error && error.message ? error.message : "No se pudo copiar";
      await new Promise(function (resolve) { window.setTimeout(resolve, 1400); });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function shareLevelResult(button) {
    var captureTarget = layer.querySelector(".science-level-complete-card") || layer;
    return copyVisiblePanel(button, captureTarget, "resultado-science-activities.png", { excludeSelector: ".science-result-actions", normalizeResult: true });
  }

  function shareAttemptHistory(button) {
    var book = layer.querySelector(".science-history-book");
    return copyVisiblePanel(button, book, "bitacora-science-activities.png", {
      revealSelector: ".science-history-question-panel[hidden]",
      excludeSelector: "[data-share-history], .science-history-reset-confirm"
    });
  }

  function handleLayerClick(event) {
    var submitButton = event.target.closest("[data-submit-assessment]");
    if (submitButton) {
      event.preventDefault();
      submitAssessmentForm(submitButton.closest("form"));
      return;
    }
    if (event.target.closest("[data-start-level]")) {
      progress.briefedLevels.push(progress.level);
      if (isLabMode) beginLabPractice();
      else startQuestionGame();
      return;
    }
    var answerButton = event.target.closest("[data-answer]");
    if (answerButton && phase === "question") {
      var answerIndex = Number(answerButton.dataset.answer);
      var answerWasCorrect = answerIndex === currentQuestion().correct;
      answerButton.classList.add("is-selected", answerWasCorrect ? "is-correct" : "is-incorrect");
      if (window.ScienceRiveHud) {
        window.ScienceRiveHud.setState(
          answerButton.querySelector("[data-science-rive-hud]"),
          answerWasCorrect ? "correct" : "incorrect"
        );
      }
      beginExperiment(answerWasCorrect, answerIndex + 1, currentQuestion().options && currentQuestion().options[answerIndex], 1);
      return;
    }
    var historyAttemptButton = event.target.closest("[data-history-attempt]");
    if (historyAttemptButton) {
      renderAttemptHistory(historyAttemptButton.dataset.historyAttempt, historyReturnView);
      return;
    }
    var historyQuestionButton = event.target.closest("[data-history-question]");
    if (historyQuestionButton) {
      var panel = document.getElementById(historyQuestionButton.getAttribute("aria-controls"));
      var expanded = historyQuestionButton.getAttribute("aria-expanded") === "true";
      historyQuestionButton.setAttribute("aria-expanded", String(!expanded));
      if (panel) panel.hidden = expanded;
      return;
    }
    var shareHistoryButton = event.target.closest("[data-share-history]");
    if (shareHistoryButton) {
      shareAttemptHistory(shareHistoryButton);
      return;
    }
    if (event.target.closest("[data-review-current]") || event.target.closest("[data-open-history]")) {
      renderAttemptHistory(completedAttempt && completedAttempt.id, "complete");
      return;
    }
    if (event.target.closest("[data-reset-history]")) {
      var confirmation = layer.querySelector(".science-history-reset-confirm");
      if (confirmation) {
        confirmation.hidden = false;
        var confirmButton = confirmation.querySelector("[data-confirm-reset]");
        if (confirmButton) confirmButton.focus();
      }
      return;
    }
    if (event.target.closest("[data-cancel-reset]")) {
      var resetConfirmation = layer.querySelector(".science-history-reset-confirm");
      if (resetConfirmation) resetConfirmation.hidden = true;
      var resetTrigger = layer.querySelector("[data-reset-history]");
      if (resetTrigger) resetTrigger.focus();
      return;
    }
    if (event.target.closest("[data-confirm-reset]")) {
      try { window.localStorage.removeItem(historyStorageKey()); } catch (error) {
        historyStorageWarning = "El navegador no permitió eliminar la bitácora local.";
      }
      clearActiveAttempt();
      progress = createProgressState();
      scoringQuestionKey = "";
      currentQuestionReview = null;
      attemptQuestionReviews = [];
      completedAttempt = null;
      renderAttemptHistory(null, "game");
      return;
    }
    if (event.target.closest("[data-history-start]") || event.target.closest("[data-history-back]") && !(historyReturnView === "complete" && completedAttempt)) {
      resetForNewAttempt();
      return;
    }
    if (event.target.closest("[data-history-back]") && historyReturnView === "complete" && completedAttempt) {
      gameMount.classList.remove("science-history-active");
      renderLevelConclusion();
      return;
    }
    if (event.target.closest("[data-continue]")) {
      if (currentQuestionReview) {
        attemptQuestionReviews.push(currentQuestionReview);
        currentQuestionReview = null;
      }
      progress.completed += 1;
      if (answeredCorrectly) progress.correct += 1;
      resetExperiment();
      if (isLabMode || progress.question >= config.questionsPerLevel) renderLevelConclusion();
      else {
        progress.question += 1;
        startQuestionGame();
      }
      return;
    }
    if (event.target.closest("[data-next-level]")) {
      progress.level += 1;
      progress.question = 1;
      progress.levelScore = 0;
      scoringQuestionKey = "";
      resetExperiment();
      renderLevelBriefing();
      return;
    }
    var shareButton = event.target.closest("[data-share-result]");
    if (shareButton) {
      shareLevelResult(shareButton);
      return;
    }
    if (event.target.closest("[data-restart-game]")) {
      resetForNewAttempt();
    }
  }

  function handleLayerSubmit(event) {
    event.preventDefault();
    submitAssessmentForm(event.target.closest("form"));
  }

  function submitAssessmentForm(form) {
    if (phase !== "question") return;
    if (!form || !form.reportValidity()) return;
    var question = currentQuestion();
    if (question.type === "keyword") {
      var rawValue = form.querySelector("input").value.trim();
      var value = normalizeAnswer(rawValue);
      beginExperiment(question.accepted.some(function (answer) { return normalizeAnswer(answer) === value; }), answerHash(value), rawValue, 1);
      return;
    }
    var selections = Array.from(form.querySelectorAll("select")).map(function (select) { return select.value; });
    if (selections.some(function (selection) { return !selection; })) return;
    beginExperiment(
      selections.every(function (selection, index) { return selection === question.pairs[index][1]; }),
      answerHash(selections.join("|")),
      selections.map(function (selection, index) { return { left: question.pairs[index][0], right: selection, correct: selection === question.pairs[index][1] }; }),
      1
    );
  }

  function initialize() {
    gameMount = document.querySelector("#scienceGameMount");
    controls = document.querySelector("#scienceGameControls");
    if (!gameMount || !controls || !gameMount.querySelector("canvas")) {
      window.setTimeout(initialize, 120);
      return;
    }
    if (config.gameMode === "simulator") {
      mountSimulator();
      return;
    }
    var initialRiveSurface = gameMount.querySelector(":scope > .science-rive-game-surface");
    if (initialRiveSurface) initialRiveSurface.remove();
    gameMount.classList.add("science-assessment-host");
    gameMount.dataset.visualStyle = config.visualStyle || "kawaii-lab";
    gameMount.dataset.simulationType = config.simulationType || "friction";
    gameMount.style.setProperty("--science-game-sky", config.theme && config.theme.sky || "#dff4ff");
    gameMount.style.setProperty("--science-game-ground", config.theme && config.theme.ground || "#8fd5c8");
    gameMount.style.setProperty("--science-game-accent", config.theme && config.theme.accent || "#ff7d68");
    controls.classList.add("science-game-controls-hidden");
    layer = document.createElement("section");
    sceneOutcome = document.createElement("div");
    sceneOutcome.className = "science-scene-outcome";
    sceneCheck = document.createElement("button");
    sceneCheck.className = "science-scene-check";
    sceneCheck.type = "button";
    sceneCheck.innerHTML = "⚗ <span>Comprobar</span>";
    gameMount.append(sceneOutcome, layer, sceneCheck);
    layer.addEventListener("click", handleLayerClick);
    layer.addEventListener("submit", handleLayerSubmit);
    controls.addEventListener("click", function (event) {
      if (!event.target.closest(".science-action:not(.secondary)") || phase !== "free") return;
    });
    sceneCheck.addEventListener("click", function () {
      if (phase === "experiment") revealResult();
      else if (phase === "lab") validateLabPractice();
      else if (phase === "free") {
        var action = controls.querySelector(".science-action:not(.secondary)");
        if (action) action.click();
      }
    });
    function persistCurrentPageState() {
      persistActiveAttempt(phase === "experiment" && currentResponse == null ? "question" : phase);
    }
    window.addEventListener("pagehide", persistCurrentPageState);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") persistCurrentPageState();
    });
    if (window.SCIENCE_ASSESSMENT_INITIAL_VIEW === "history") renderAttemptHistory(null, "game");
    else if (restoreActiveAttempt()) renderRestoredAttempt();
    else renderLevelBriefing();
  }

  initialize();
}());
