(function () {
  function mountSimulator() {
    gameMount.classList.add("science-simulator-host");
    gameMount.querySelector("canvas").style.opacity = "0";
    controls.classList.add("science-game-controls-hidden");
    var simulator = config.simulator || {};
    var values = Object.assign({}, simulator.values || {});
    (config.controls || []).forEach(function (control) {
      if (!Number.isFinite(Number(values[control.id]))) values[control.id] = Number(control.value);
    });
    var shell = document.createElement("section");
    shell.className = "science-simulator-shell";
    shell.innerHTML = "<header><small>SIMULADOR CIENTÍFICO</small><h2>" + escapeHtml(config.challenge && config.challenge.title || "Experimento interactivo") +
      "</h2><p>" + escapeHtml(simulator.objective || config.challenge && config.challenge.description || "") + "</p></header>" +
      "<div class=\"science-simulator-workbench\"><div class=\"science-simulator-pulse\"><i></i><b></b></div><aside><small>MEDICIÓN EN TIEMPO REAL</small><strong data-reading>0</strong><code>" +
      escapeHtml(simulator.formula || "") + "</code></aside></div>" +
      "<div class=\"science-simulator-controls\">" + (config.controls || []).map(function (control) {
        return "<label><span>" + escapeHtml(control.label) + " <strong data-value=\"" + escapeHtml(control.id) + "\">" +
          values[control.id] + " " + escapeHtml(control.unit) + "</strong></span><input type=\"range\" data-input=\"" +
          escapeHtml(control.id) + "\" min=\"" + control.min + "\" max=\"" + control.max + "\" step=\"" + control.step + "\" value=\"" + values[control.id] + "\"></label>";
      }).join("") + "</div><footer><button data-run>▶ Ejecutar</button><button data-pause>Ⅱ Pausar</button><button data-reset>↻ Restablecer valores iniciales</button></footer>";
    gameMount.append(shell);
    var running = false;
    var frame = 0;
    function calculate() {
      var list = Object.values(values).map(Number);
      var result = list.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, list.length);
      if (config.simulationType === "friction") result = (Number(values.force || 0) - Number(values.friction || 0)) / Math.max(.01, Number(values.mass || 1));
      if (config.simulationType === "circuit") result = Number(values.voltage || 0) / Math.max(.01, Number(values.resistance || 1));
      if (config.simulationType === "energy") result = Number(values.mass || 0) * Number(values.gravity || 9.8) * Number(values.height || 0);
      if (config.simulationType === "wave") result = Number(values.frequency || 0) * Number(values.wavelength || 0) / 100;
      if (config.simulationType === "math") result = Number(values.coefficient || 1) * Number(values.x || 0) + Number(values.constant || 0);
      shell.querySelector("[data-reading]").textContent = result.toFixed(2);
      shell.style.setProperty("--science-sim-level", Math.max(8, Math.min(96, Math.abs(result) % 100)) + "%");
      if (running) frame = requestAnimationFrame(calculate);
    }
    shell.addEventListener("input", function (event) {
      var id = event.target.dataset.input;
      if (!id) return;
      values[id] = Number(event.target.value);
      var control = (config.controls || []).find(function (item) { return item.id === id; });
      shell.querySelector("[data-value=\"" + CSS.escape(id) + "\"]").textContent = values[id] + " " + (control && control.unit || "");
      calculate();
    });
    shell.addEventListener("click", function (event) {
      if (event.target.closest("[data-run]")) {
        running = true;
        shell.classList.add("is-running");
        cancelAnimationFrame(frame);
        calculate();
      }
      if (event.target.closest("[data-pause]")) {
        running = false;
        shell.classList.remove("is-running");
        cancelAnimationFrame(frame);
      }
      if (event.target.closest("[data-reset]")) {
        (config.controls || []).forEach(function (control) {
          values[control.id] = Number(control.value);
          shell.querySelector("[data-input=\"" + CSS.escape(control.id) + "\"]").value = control.value;
          shell.querySelector("[data-value=\"" + CSS.escape(control.id) + "\"]").textContent = control.value + " " + control.unit;
        });
        calculate();
      }
    });
    calculate();
  }

  "use strict";

  var config = window.SCIENCE_ASSESSMENT_CONFIG;
  if (!config || !Array.isArray(config.questions) || !config.questions.length) return;
  var isLabMode = config.gameMode === "lab";

  var progress = { level: 1, question: 1, correct: 0, completed: 0, briefedLevels: [] };
  var phase = "question";
  var answeredCorrectly = false;
  var layer;
  var sceneOutcome;
  var gameMount;
  var controls;
  var sceneCheck;
  var modeToggle;
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
    if (!normalized) return "";
    var concise = normalized.split(" ").slice(0, maxWords).join(" ");
    if (concise.length > maxCharacters) concise = concise.slice(0, maxCharacters).replace(/\s+\S*$/, "");
    return concise.length < normalized.length ? concise.replace(/[,:;.-]+$/, "") + "…" : concise;
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
    phase = "briefing";
    gameMount.classList.add("is-level-briefing");
    layer.className = "science-assessment-layer science-briefing-layer";
    layer.innerHTML = "<article class=\"science-rive-briefing-screen science-micro-mission\">" +
      "<div class=\"science-micro-visual\">" + image +
      "<div class=\"science-rive-hud science-rive-visual\" data-science-rive-hud data-rive-role=\"briefing\" data-rive-artboard=\"New Artboard\" data-rive-state-machine=\"State Machine 1\" data-rive-fit=\"contain\" data-rive-level=\"" + progress.level +
      "\" data-rive-progress=\"" + Math.max(0, Math.min(1, (progress.question - 1) / config.questionsPerLevel)) +
      "\" aria-hidden=\"true\"><canvas></canvas></div>" +
      "<div class=\"science-micro-level\"><span>Nivel " + progress.level + "</span><strong>" + escapeHtml(limitLearningText(level.title, 7, 56)) + "</strong></div></div>" +
      "<div class=\"science-micro-content\">" + progressMarkup() +
      "<div class=\"science-micro-kicker\"><span>Micro-misión</span><b>" + progress.question + "/" + config.questionsPerLevel + "</b></div>" +
      "<h2>" + escapeHtml(limitLearningText(level.objective || config.mission, 13, 96)) + "</h2>" +
      "<div class=\"science-micro-concepts\">" + concepts.map(function (concept, index) {
        return "<div class=\"science-micro-concept\"><span>0" + (index + 1) + "</span><p><strong>" +
          escapeHtml(limitLearningText(concept.term, 4, 38)) + "</strong>" +
          escapeHtml(limitLearningText(concept.definition, 16, 112)) + "</p></div>";
      }).join("") + "</div>" +
      "<div class=\"science-micro-example\"><span><small>Ejemplo real</small><strong>" +
      escapeHtml(limitLearningText(practicalExample, 18, 118)) + "</strong></span></div>" +
      "<button class=\"science-start-level science-micro-launch\" type=\"button\" data-start-level><span>" +
      (isLabMode ? "Abrir práctica" : "Jugar pregunta 1") + "</span><i class=\"fas fa-arrow-right\" aria-hidden=\"true\"></i></button>" +
      "</div></article>";
    window.requestAnimationFrame(function () {
      if (window.ScienceRiveHud) window.ScienceRiveHud.mountAll(layer);
    });
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  }

  function answerMarkup(question) {
    if (question.type === "multiple") {
      return "<div class=\"science-answer-options\">" + question.options.map(function (option, index) {
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
      "<small>" + (question.type === "multiple" ? "Opción múltiple" : question.type === "matching" ? "Emparejamiento" : "Palabra clave") + "</small>" +
      "<h2>" + escapeHtml(limitLearningText(question.prompt, 24, 175)) + "</h2>" +
      "<p>Elige tu hipótesis.</p>" +
      answerMarkup(question) + "</div>";
    window.requestAnimationFrame(function () {
      if (window.ScienceRiveHud) window.ScienceRiveHud.mountAll(layer);
    });
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  }

  function renderQuestion() {
    setResultSurface(false);
    gameMount.classList.remove("is-level-briefing");
    var question = currentQuestion();
    phase = "question-intro";
    gameMount.classList.remove("science-result-correct", "science-result-incorrect", "science-experiment-active", "science-experiment-success", "science-experiment-failed");
    sceneCheck.classList.remove("show");
    layer.className = "science-assessment-layer";
    layer.innerHTML = "<div class=\"science-question-world\" aria-hidden=\"true\"><i></i><i></i><i></i></div>" +
      "<div class=\"science-question-card science-question-launch\" data-question-type=\"" + escapeHtml(question.type) + "\">" +
      "<div class=\"science-question-badge\">" + (simulationIcons[config.simulationType] || "✦") + " Pregunta " + progress.question + "</div>" +
      progressMarkup() +
      "<small>" + (question.type === "multiple" ? "Opción múltiple" : question.type === "matching" ? "Emparejamiento" : "Palabra clave") + "</small>" +
      "<h2>" + escapeHtml(limitLearningText(question.prompt, 24, 175)) + "</h2>" +
      "<button class=\"science-start-level\" type=\"button\" data-enter-question-game>Jugar ahora →</button></div>";
    setControlsEnabled(false);
  }

  function startQuestionGame() {
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
        controls: config.controls
      })
      : null;
    if (!run) {
      phase = "question";
      gameMount.classList.remove("science-experiment-active");
      renderAccessibleQuestion();
      return;
    }
    Promise.resolve(run).then(function (result) {
      if (result && result.cancelled || phase !== "experiment") return;
      answeredCorrectly = Boolean(result && result.correct);
      revealResult();
    });
  }

  function beginLabPractice() {
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

  function beginExperiment(correct, answerSeed) {
    answeredCorrectly = correct;
    phase = "experiment";
    applyAnswerPreset(answerSeed, correct);
    layer.classList.add("is-hidden");
    gameMount.classList.remove("science-experiment-success", "science-experiment-failed");
    gameMount.classList.add("science-experiment-active");
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    setControlsEnabled(false);
    window.setTimeout(revealResult, 260);
  }

  function revealResult() {
    if (phase !== "experiment") return;
    var question = currentQuestion();
    var labFeedback = answeredCorrectly
      ? "La práctica alcanzó " + escapeHtml(config.challenge && config.challenge.targetLabel || "el objetivo experimental") + " dentro de la tolerancia permitida."
      : "La prueba quedó fuera del objetivo. Ajusta las variables para aproximarte a " +
        escapeHtml(config.challenge && config.challenge.targetValue != null ? config.challenge.targetValue : "el valor indicado") +
        " ± " + escapeHtml(config.challenge && config.challenge.tolerance != null ? config.challenge.tolerance : 5) + ".";
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
      "<p>" + (isLabMode ? labFeedback : escapeHtml(question.feedback || "Cambia una variable a la vez, observa la evidencia y vuelve a intentarlo.")) + "</p>" +
      "<div class=\"science-rive-result-proof " + (answeredCorrectly ? "is-positive" : "is-zero") + "\"><i>" + (answeredCorrectly ? "⚡" : "↻") + "</i><span><small>" + (answeredCorrectly ? "Evidencia registrada" : "Hipótesis por revisar") + "</small><strong>" + (answeredCorrectly ? "+1 evidencia" : "Nueva prueba") + "</strong></span><em>" + (answeredCorrectly ? "La relación fue confirmada por el experimento." : "Cambia una variable y contrasta otra vez.") + "</em></div>" +
      "<div class=\"science-result-actions science-rive-result-actions\"><button type=\"button\" data-retry>↻ Reintentar</button>" +
      "<button type=\"button\" data-continue>→ " +
      (isLabMode ? "Concluir práctica" : (progress.question === config.questionsPerLevel ? "Concluir nivel" : "Siguiente pregunta")) +
      "</button></div></div></article>";
    window.requestAnimationFrame(function () {
      var resultScreen = layer.querySelector(".science-rive-result-screen");
      if (resultScreen) resultScreen.focus({ preventScroll: true });
    });
  }

  function renderLevelConclusion() {
    var isLast = progress.level >= config.levelCount;
    var total = config.levelCount * config.questionsPerLevel;
    var score = Math.round((progress.correct / total) * 100);
    phase = isLast ? "complete" : "level-complete";
    gameMount.classList.remove("science-result-incorrect");
    gameMount.classList.add("science-result-correct");
    setResultSurface(true);
    layer.className = "science-assessment-layer is-result is-correct";
    layer.innerHTML = "<div class=\"science-question-card science-result-card science-level-complete\">" +
      "<div class=\"science-stars\">★ ★ ★</div>" +
      "<small>" + (isLast ? "Juego concluido" : "Nivel " + progress.level + " superado") + "</small>" +
      "<h2>" + (isLast ? "¡Misión científica completada!" : (isLabMode ? "Práctica de laboratorio completada" : "Todas las preguntas fueron experimentadas")) + "</h2>" +
      "<p>" + (isLast
        ? (isLabMode ? "Completaste " + config.levelCount + " prácticas y validaste " + progress.correct + " procedimientos." : "Completaste " + total + " preguntas y confirmaste " + progress.correct + " hipótesis. Resultado: " + score + "%.")
        : (isLabMode ? "Concluiste la práctica. El siguiente nivel presenta un nuevo procedimiento experimental." : "Concluiste las " + config.questionsPerLevel + " preguntas. Ya puedes avanzar al siguiente nivel.")) +
      "</p><div class=\"science-result-actions\"><button type=\"button\" " +
      (isLast ? "data-restart-game" : "data-next-level") + ">" +
      (isLast ? "↻ Jugar de nuevo" : "⚑ Comenzar nivel " + (progress.level + 1)) +
      "</button></div></div>";
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
    if (event.target.closest("[data-enter-question-game]") && phase === "question-intro") {
      startQuestionGame();
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
      beginExperiment(answerWasCorrect, answerIndex + 1);
      return;
    }
    if (event.target.closest("[data-retry]")) {
      resetExperiment();
      if (isLabMode) beginLabPractice();
      else startQuestionGame();
      return;
    }
    if (event.target.closest("[data-continue]")) {
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
      resetExperiment();
      renderLevelBriefing();
      return;
    }
    if (event.target.closest("[data-restart-game]")) {
      progress = { level: 1, question: 1, correct: 0, completed: 0, briefedLevels: [] };
      resetExperiment();
      renderLevelBriefing();
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
      var value = normalizeAnswer(form.querySelector("input").value);
      beginExperiment(question.accepted.some(function (answer) { return normalizeAnswer(answer) === value; }), answerHash(value));
      return;
    }
    var selections = Array.from(form.querySelectorAll("select")).map(function (select) { return select.value; });
    if (selections.some(function (selection) { return !selection; })) return;
    beginExperiment(
      selections.every(function (selection, index) { return selection === question.pairs[index][1]; }),
      answerHash(selections.join("|"))
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
    modeToggle = document.createElement("button");
    modeToggle.className = "science-mode-toggle";
    modeToggle.type = "button";
    modeToggle.innerHTML = "⚙ <span>Modo libre</span>";
    modeToggle.hidden = isLabMode;
    gameMount.append(sceneOutcome, layer, sceneCheck, modeToggle);
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
    modeToggle.addEventListener("click", function () {
      if (phase !== "free") {
        modeToggle.dataset.previousPhase = phase;
        phase = "free";
        layer.classList.add("is-hidden");
        sceneOutcome.classList.remove("show");
        gameMount.classList.remove("science-experiment-active", "science-experiment-success", "science-experiment-failed", "science-result-correct", "science-result-incorrect");
        controls.classList.remove("science-game-controls-hidden");
        setControlsEnabled(true);
        sceneCheck.classList.add("show");
        modeToggle.innerHTML = "◀ <span>Volver al juego</span>";
        return;
      }
      phase = modeToggle.dataset.previousPhase || "question";
      controls.classList.add("science-game-controls-hidden");
      sceneCheck.classList.remove("show");
      modeToggle.innerHTML = "⚙ <span>Modo libre</span>";
      if (phase === "experiment") {
        layer.classList.add("is-hidden");
        sceneOutcome.classList.add("show");
        sceneCheck.classList.add("show");
        gameMount.classList.add("science-experiment-active", answeredCorrectly ? "science-experiment-success" : "science-experiment-failed");
      } else {
        layer.classList.remove("is-hidden");
        setControlsEnabled(false);
      }
    });
    renderLevelBriefing();
  }

  initialize();
}());
