const ESCAPE_ROOM_DATA = {
  "titulo": "Operación Galaxia Segura: El Código de la Singularidad",
  "subtitulo": "Detén el colapso financiero y la fuga de datos intergaláctica",
  "introduccion": "¡Atención, cadete! El Banco Central de la Federación y el Nexo de Datos están bajo un ataque coordinado. Un infiltrado está drenando créditos físicos y un grupo de hackers está extrayendo información confidencial. Ambos utilizan patrones matemáticos de progresión aritmética para evadir los radares. Tu misión es descifrar estos patrones y generar la clave de anulación antes de que el sistema colapse en 35 minutos.",
  "ambientacion": "Una estación espacial de alta tecnología con pantallas holográficas parpadeantes, alarmas silenciosas de color ámbar y una terminal de comandos que espera la secuencia de desactivación.",
  "linea_visual_base": "Estética ciberpunk espacial con tonos azul neón, fuentes digitales y diagramas de flujo de datos en 3D.",
  "estilo_visual": "",
  "personajes_recurrentes": [],
  "misiones": [
    {
      "id": "m1",
      "release": "RELEASE 01",
      "titulo": "El Infiltrado del Cajero Central",
      "historia": "Hemos detectado que un ladrón extrae dinero de un cajero automático en el Sector Oro. El primer día robó $500, el segundo $550 y el tercero $600. El patrón es constante, pero el sistema de seguridad solo se reiniciará si identificamos los valores exactos de su infiltración a largo plazo y detectamos errores en los informes del guardia Pedro.",
      "reto": "Relaciona los datos del robo para obtener la ecuación y el valor crítico del día 25.",
      "tipo_interaccion": "relacion_columnas",
      "subtipo_respuesta": "codigo_corto",
      "respuesta_correcta": "ECUACION-1700",
      "respuestas_aceptadas": [
        "1700",
        "ecuacion1700"
      ],
      "opciones": [],
      "parejas": [
        {
          "izquierda": "Dinero en el Día 25",
          "derecha": "$1700",
          "pista": ""
        },
        {
          "izquierda": "Ecuación del robo",
          "derecha": "an = 500 + (n-1)50",
          "pista": ""
        },
        {
          "izquierda": "Dato de Pedro (Día 10)",
          "derecha": "Incorrecto (Robó $950)",
          "pista": ""
        },
        {
          "izquierda": "Incremento diario",
          "derecha": "$50",
          "pista": ""
        }
      ],
      "media": {
        "tipo": "imagen",
        "url": "",
        "alt": "Holograma de transacciones bancarias en aumento",
        "titulo": "",
        "texto": ""
      },
      "pista": "Calcula primero la diferencia constante (d). Luego usa la fórmula an = a1 + (n-1)d.",
      "retroalimentacion_correcta": "¡Excelente! Has descifrado el patrón del ladrón. El valor crítico del día 25 es 1700. Guárdalo, lo necesitarás para la clave final.",
      "retroalimentacion_incorrecta": "Los cálculos no coinciden. Revisa la diferencia diaria y verifica si el día 10 realmente suma $1520.",
      "imagen_funcion": "Apoya la resolución con una pista visual.",
      "imagen_prompt": "",
      "imagen_alt": "",
      "imagen": "",
      "preguntas": [
        {
          "id": "mission-elinfiltradodelcajerocentral-question-1",
          "release": "Q01",
          "titulo": "El Infiltrado del Cajero Central",
          "reto": "Relaciona los datos del robo para obtener la ecuación y el valor crítico del día 25.",
          "tipo_interaccion": "relacion_columnas",
          "subtipo_respuesta": "codigo_corto",
          "respuesta_correcta": "ECUACION-1700",
          "respuestas_aceptadas": [
            "1700",
            "ecuacion1700"
          ],
          "opciones": [],
          "parejas": [
            {
              "izquierda": "Dinero en el Día 25",
              "derecha": "$1700",
              "pista": ""
            },
            {
              "izquierda": "Ecuación del robo",
              "derecha": "an = 500 + (n-1)50",
              "pista": ""
            },
            {
              "izquierda": "Dato de Pedro (Día 10)",
              "derecha": "Incorrecto (Robó $950)",
              "pista": ""
            },
            {
              "izquierda": "Incremento diario",
              "derecha": "$50",
              "pista": ""
            }
          ],
          "media": {
            "tipo": "imagen",
            "url": "",
            "alt": "Holograma de transacciones bancarias en aumento",
            "titulo": "",
            "texto": ""
          },
          "pista": "Calcula primero la diferencia constante (d). Luego usa la fórmula an = a1 + (n-1)d.",
          "retroalimentacion_correcta": "¡Excelente! Has descifrado el patrón del ladrón. El valor crítico del día 25 es 1700. Guárdalo, lo necesitarás para la clave final.",
          "retroalimentacion_incorrecta": "Los cálculos no coinciden. Revisa la diferencia diaria y verifica si el día 10 realmente suma $1520.",
          "imagen_funcion": "Apoya la resolución con una pista visual.",
          "imagen_prompt": "",
          "imagen_alt": "",
          "imagen": "",
          "bloqueada_inicial": false
        }
      ],
      "desbloquea": [
        "m2"
      ],
      "bloqueada_inicial": false,
      "unlockedIds": [
        "m1"
      ]
    },
    {
      "id": "m2",
      "release": "RELEASE 02",
      "titulo": "La Brecha del Nexo de Datos",
      "historia": "¡Alerta! Los hackers han superado el primer nivel. En el minuto 1 descargaron 25 MB, en el minuto 2 descargaron 42 MB y en el minuto 3 descargaron 59 MB. Luis dice que en el minuto 6 la velocidad es de 70 MB, pero sospechamos que miente. Para detener el ataque, debes calcular la descarga en el minuto 18 y sumarla al valor crítico de la misión anterior (Día 25 = 1700).",
      "reto": "¿Cuál es la clave final de 4 dígitos para apagar el sistema? (Suma de MB en min 18 + Dinero en día 25)",
      "tipo_interaccion": "texto",
      "subtipo_respuesta": "numero",
      "respuesta_correcta": "2014",
      "respuestas_aceptadas": [
        "2014"
      ],
      "opciones": [],
      "parejas": [],
      "media": {
        "tipo": "video",
        "url": "",
        "alt": "Código digital cayendo en una pantalla de terminal",
        "titulo": "",
        "texto": ""
      },
      "pista": "La diferencia de descarga es de 17 MB por minuto. Calcula el minuto 18 usando an = 25 + (n-1)17 y súmalo a 1700.",
      "retroalimentacion_correcta": "¡Código aceptado! 314 MB (minuto 18) + 1700 (día 25) = 2014. El sistema se está reiniciando y los intrusos han sido bloqueados.",
      "retroalimentacion_incorrecta": "Clave incorrecta. Verifica la descarga del minuto 18. Recuerda que Luis estaba equivocado; la velocidad en el minuto 6 no era 70.",
      "imagen_funcion": "Apoya la resolución con una pista visual.",
      "imagen_prompt": "",
      "imagen_alt": "",
      "imagen": "",
      "preguntas": [
        {
          "id": "mission-labrechadelnexodedatos-question-1",
          "release": "Q01",
          "titulo": "La Brecha del Nexo de Datos",
          "reto": "¿Cuál es la clave final de 4 dígitos para apagar el sistema? (Suma de MB en min 18 + Dinero en día 25)",
          "tipo_interaccion": "texto",
          "subtipo_respuesta": "numero",
          "respuesta_correcta": "2014",
          "respuestas_aceptadas": [
            "2014"
          ],
          "opciones": [],
          "parejas": [],
          "media": {
            "tipo": "video",
            "url": "",
            "alt": "Código digital cayendo en una pantalla de terminal",
            "titulo": "",
            "texto": ""
          },
          "pista": "La diferencia de descarga es de 17 MB por minuto. Calcula el minuto 18 usando an = 25 + (n-1)17 y súmalo a 1700.",
          "retroalimentacion_correcta": "¡Código aceptado! 314 MB (minuto 18) + 1700 (día 25) = 2014. El sistema se está reiniciando y los intrusos han sido bloqueados.",
          "retroalimentacion_incorrecta": "Clave incorrecta. Verifica la descarga del minuto 18. Recuerda que Luis estaba equivocado; la velocidad en el minuto 6 no era 70.",
          "imagen_funcion": "Apoya la resolución con una pista visual.",
          "imagen_prompt": "",
          "imagen_alt": "",
          "imagen": "",
          "bloqueada_inicial": true
        }
      ],
      "desbloquea": [],
      "bloqueada_inicial": true,
      "unlockedIds": [
        "m1"
      ]
    }
  ],
  "conclusion": "¡Misión cumplida, cadete! Has demostrado un dominio total de las progresiones aritméticas. Gracias a tu precisión matemática, los fondos de la Federación están seguros y los datos confidenciales han sido recuperados. La 'Cámara del Conocimiento' ahora está abierta para ti.",
  "backgroundImage": "assets/media/Operacion_Galaxia_Segura_El_Codigo_de_la_Singularidad-background.png"
};

// Runtime de mapa libre: las salas desbloqueadas se eligen en cualquier orden permitido.
(function initEscapeRoomGame() {
  const state = {
    unlocked: new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id)),
    completed: new Set(),
    completedQuestions: new Set(),
    questionAnswers: {},
    questionChoices: {},
    questionMatches: {},
    currentMissionId: ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null,
    galleryScreen: "intro",
    missionEventsBound: false
  };

  function isStorageAvailable() {
    try {
      const key = "__escape_room_runtime_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getProgressStorageKey() {
    const slug = normalizeBaseText(ESCAPE_ROOM_DATA.titulo || "escape-room") || "escape-room";
    return "escapeRoomGame.progress." + slug;
  }

  function serializeProgressState() {
    return {
      completed: [...state.completed],
      completedQuestions: [...state.completedQuestions],
      questionAnswers: state.questionAnswers,
      questionChoices: state.questionChoices,
      questionMatches: state.questionMatches,
      currentMissionId: state.currentMissionId,
      galleryScreen: state.galleryScreen,
      unlocked: [...state.unlocked]
    };
  }

  function saveProgressState() {
    if (!isStorageAvailable()) return;
    try {
      window.localStorage.setItem(getProgressStorageKey(), JSON.stringify(serializeProgressState()));
    } catch (error) {
      console.warn("No se pudo guardar el avance del escape room:", error);
    }
  }

  function restoreProgressState() {
    if (!isStorageAvailable()) return;
    const raw = window.localStorage.getItem(getProgressStorageKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const missionIds = new Set(ESCAPE_ROOM_DATA.misiones.map((mission) => mission.id));
      state.completed = new Set(Array.isArray(parsed.completed) ? parsed.completed.filter((id) => missionIds.has(id)) : []);
      state.completedQuestions = new Set(Array.isArray(parsed.completedQuestions) ? parsed.completedQuestions.filter((key) => String(key || "").includes("::")) : []);
      state.questionAnswers = parsed.questionAnswers && typeof parsed.questionAnswers === "object" ? parsed.questionAnswers : {};
      state.questionChoices = parsed.questionChoices && typeof parsed.questionChoices === "object" ? parsed.questionChoices : {};
      state.questionMatches = parsed.questionMatches && typeof parsed.questionMatches === "object" ? parsed.questionMatches : {};
      state.unlocked = new Set(Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => missionIds.has(id)) : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
      state.currentMissionId = missionIds.has(parsed.currentMissionId) ? parsed.currentMissionId : (ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null);
      state.galleryScreen = ["intro", "mission", "ending"].includes(parsed.galleryScreen) ? parsed.galleryScreen : "intro";
    } catch (error) {
      console.warn("No se pudo restaurar el avance del escape room:", error);
    }
  }

  function persistProgressState() {
    saveProgressState();
  }

  const els = {
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    galleryStep: document.getElementById("galleryStep"),
    galleryScreens: Array.from(document.querySelectorAll("[data-gallery-screen]")),
    galleryPrevButtons: Array.from(document.querySelectorAll("[data-gallery-prev]")),
    galleryNextButtons: Array.from(document.querySelectorAll("[data-gallery-next]")),
    mapGrid: document.getElementById("mapGrid"),
    missionStage: document.getElementById("missionStage"),
    questionProgress: document.getElementById("questionProgress"),
    roomStatusBox: document.getElementById("roomStatusBox"),
    endingPanel: document.getElementById("endingPanel")
  };

  function normalizeBaseText(value = "") {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isRenderableMediaUrl(url = "") {
    return /^data:/i.test(url) || /^assets\//i.test(url) || /^\.{0,2}\//.test(url);
  }

  function normalizePlayerAnswer(value, mission) {
    const subtype = mission?.subtipo_respuesta || "frase_corta";
    const raw = String(value ?? "").trim();
    if (subtype === "numero") {
      const digits = raw.replace(/[^\d.-]+/g, "");
      if (!digits) return "";
      const number = Number(digits);
      return Number.isFinite(number) ? String(number) : "";
    }
    const base = normalizeBaseText(raw);
    if (!base) return "";
    if (subtype === "letra") return base.slice(0, 1);
    return base;
  }

  function getMissionAcceptedAnswers(mission) {
    return Array.isArray(mission?.respuestas_aceptadas) ? mission.respuestas_aceptadas : [];
  }

  function missionById(id) {
    return ESCAPE_ROOM_DATA.misiones.find((mission) => mission.id === id) || null;
  }

  function areAllMissionsCompleted() {
    return state.completed.size === ESCAPE_ROOM_DATA.misiones.length;
  }

  function renderGallery() {
    const galleryOrder = ["intro", "mission", "ending"];
    if (!galleryOrder.includes(state.galleryScreen)) {
      state.galleryScreen = "intro";
    }
    if (state.galleryScreen === "ending" && !areAllMissionsCompleted()) {
      state.galleryScreen = "mission";
    }

    els.galleryScreens.forEach((screen) => {
      const isActive = screen.dataset.galleryScreen === state.galleryScreen;
      screen.classList.toggle("is-active", isActive);
    });

    const activeIndex = galleryOrder.indexOf(state.galleryScreen);
    if (els.galleryStep) {
      els.galleryStep.textContent = "Sección " + (activeIndex + 1) + " de " + galleryOrder.length;
    }

    els.galleryPrevButtons.forEach((button) => {
      button.disabled = state.galleryScreen === "intro";
    });

    els.galleryNextButtons.forEach((button) => {
      if (state.galleryScreen === "intro") {
        button.disabled = false;
        button.textContent = "Ver siguiente sección";
        return;
      }
      if (state.galleryScreen === "mission") {
        const complete = areAllMissionsCompleted();
        button.disabled = !complete;
        button.textContent = complete ? "Ver victoria" : "Completa todas las salas";
        return;
      }
      button.disabled = true;
      button.textContent = "Final";
    });

    if (els.endingPanel) {
      const shouldShowEnding = state.galleryScreen === "ending" && areAllMissionsCompleted();
      els.endingPanel.classList.toggle("hidden", !shouldShowEnding);
    }

    persistProgressState();
  }

  function setGalleryScreen(screenName = "intro") {
    const galleryOrder = ["intro", "mission", "ending"];
    const nextScreen = galleryOrder.includes(screenName) ? screenName : "intro";
    if (nextScreen === "ending" && !areAllMissionsCompleted()) return;
    state.galleryScreen = nextScreen;
    renderGallery();
  }

  function goToPreviousGalleryScreen() {
    if (state.galleryScreen === "mission") setGalleryScreen("intro");
    else if (state.galleryScreen === "ending") setGalleryScreen("mission");
  }

  function goToNextGalleryScreen() {
    if (state.galleryScreen === "intro") setGalleryScreen("mission");
    else if (state.galleryScreen === "mission" && areAllMissionsCompleted()) setGalleryScreen("ending");
  }

  function updateProgress() {
    const total = ESCAPE_ROOM_DATA.misiones.length || 1;
    const done = state.completed.size;
    const percent = Math.min((done / total) * 100, 100);
    if (els.progressText) els.progressText.textContent = done + " / " + total;
    if (els.progressBar) els.progressBar.style.width = percent + "%";
  }

  function renderMap() {
    if (!els.mapGrid) return;
    els.mapGrid.innerHTML = "";
    ESCAPE_ROOM_DATA.misiones.forEach((mission, index) => {
      const locked = !state.unlocked.has(mission.id);
      const complete = state.completed.has(mission.id);
      const active = state.currentMissionId === mission.id;
      const roomLabel = `Sala ${String(index + 1).padStart(2, "0")}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-card ${locked ? "is-locked" : ""} ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`;
      button.dataset.openMission = mission.id;
      button.disabled = locked;
      button.setAttribute("aria-label", roomLabel + (mission.titulo ? " · " + mission.titulo : ""));
      button.textContent = roomLabel;
      els.mapGrid.appendChild(button);
    });

    els.mapGrid.querySelectorAll("[data-open-mission]").forEach((button) => {
      button.addEventListener("click", () => {
        const missionId = button.getAttribute("data-open-mission");
        if (!missionId || !state.unlocked.has(missionId)) return;
        state.currentMissionId = missionId;
        persistProgressState();
        render();
      });
    });
  }

  function getRoomQuestions(mission) {
    return Array.isArray(mission?.preguntas) && mission.preguntas.length ? mission.preguntas : [];
  }

  function getQuestionKey(mission, question) {
    return String(mission?.id || "mission") + "::" + String(question?.id || "question");
  }

  function getQuestionAcceptedAnswers(question) {
    return Array.isArray(question?.respuestas_aceptadas) ? question.respuestas_aceptadas : [];
  }

  function areMissionQuestionsCompleted(mission) {
    const questions = getRoomQuestions(mission);
    return questions.length > 0 && questions.every((question) => state.completedQuestions.has(getQuestionKey(mission, question)));
  }

  function getCompletedQuestionCount(mission) {
    return getRoomQuestions(mission).filter((question) => state.completedQuestions.has(getQuestionKey(mission, question))).length;
  }

  function renderMissionTextBlock(question, key) {
    const placeholderBySubtype = {
      palabra: "Escribe una palabra",
      letra: "Escribe una letra",
      numero: "Escribe un numero",
      codigo_corto: "Escribe el codigo",
      frase_corta: "Escribe tu respuesta"
    };
    const maxLength = question.subtipo_respuesta === "letra" ? 1 : "";
    const type = question.subtipo_respuesta === "numero" ? "number" : "text";
    const currentValue = state.questionAnswers[key] || "";
    return '<input id="questionAnswer-' + escapeHtmlAttr(key) + '" class="field question-answer-input" data-question-answer="' + escapeHtmlAttr(key) + '" type="' + type + '"' + (maxLength ? ' maxlength="' + maxLength + '"' : '') + ' value="' + escapeHtmlAttr(currentValue) + '" placeholder="' + escapeHtmlAttr(placeholderBySubtype[question.subtipo_respuesta] || "Escribe tu respuesta") + '">';
  }

  function renderMissionChoiceBlock(question, key) {
    const selected = Number(state.questionChoices[key] ?? -1);
    return '<div class="choice-grid">' + question.opciones.map((option, index) => {
      const isSelected = selected === index ? ' is-selected' : '';
      return '<button type="button" class="choice-card' + isSelected + '" data-question-choice="' + escapeHtmlAttr(key) + '" data-choice-index="' + index + '">' + escapeHtml(option) + '</button>';
    }).join('') + '</div>';
  }

  function renderMissionMatchingBlock(question, key) {
    const selections = state.questionMatches[key] || {};
    const options = [...question.parejas]
      .map((pair) => pair.derecha)
      .sort((a, b) => a.localeCompare(b, "es"));
    const rows = question.parejas.map((pair, index) => {
      const currentValue = selections[String(index)] || "";
      return '<div class="match-row-grid"><div class="match-item">' + escapeHtml(pair.izquierda) + '</div><select class="match-select" data-question-match-select="' + escapeHtmlAttr(key) + '" data-match-index="' + index + '"><option value="">Selecciona una opcion</option>' + options.map((option) => '<option value="' + escapeHtmlAttr(option) + '"' + (currentValue === option ? ' selected' : '') + '>' + escapeHtml(option) + '</option>').join('') + '</select></div>';
    }).join('');
    return '<div class="match-grid">' + rows + '</div>';
  }

  function renderQuestionMedia(question) {
    const media = question.media;
    const safeUrl = media?.url && isRenderableMediaUrl(media.url) ? media.url : "";
    if (!safeUrl) {
      const note = media?.texto || media?.alt || "";
      return note ? '<div class="media-card media-card-empty"><div class="muted">' + escapeHtml(note) + '</div></div>' : "";
    }
    if (media.tipo === "audio") {
      return '<div class="media-card"><audio controls src="' + escapeHtmlAttr(safeUrl) + '"></audio><div class="muted">' + escapeHtml(media.alt || "") + '</div></div>';
    }
    if (media.tipo === "video") {
      return '<div class="media-card"><video controls src="' + escapeHtmlAttr(safeUrl) + '"></video><div class="muted">' + escapeHtml(media.alt || "") + '</div></div>';
    }
    return '<div class="media-card"><img src="' + escapeHtmlAttr(safeUrl) + '" alt="' + escapeHtmlAttr(media.alt || question.titulo) + '"><div class="muted">' + escapeHtml(media.alt || "") + '</div></div>';
  }

  function renderQuestionInteraction(question, key) {
    if (question.tipo_interaccion === "opcion_multiple") return renderMissionChoiceBlock(question, key);
    if (question.tipo_interaccion === "relacion_columnas") return renderMissionMatchingBlock(question, key);
    return renderMissionTextBlock(question, key);
  }

  function renderQuestionCard(mission, question, questionIndex) {
    const key = getQuestionKey(mission, question);
    const total = getRoomQuestions(mission).length || 1;
    const complete = state.completedQuestions.has(key);
    const cardClass = 'mission-panel question-card' + (complete ? ' is-complete' : '');
    const statusText = complete ? (question.retroalimentacion_correcta || 'Correcto.') : 'Resuelve esta pregunta para avanzar.';
    const mediaHtml = renderQuestionMedia(question);
    const interactionHtml = complete ? '<div class="status-box is-good">Pregunta completada.</div>' : renderQuestionInteraction(question, key);
    return '<article class="' + cardClass + '" data-question-card data-question-key="' + escapeHtmlAttr(key) + '">' +
      '<div class="question-head">' +
        '<div>' +
          '<div class="label">Pregunta ' + String(questionIndex + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0') + '</div>' +
          '<h3 class="question-title">' + escapeHtml(question.titulo) + '</h3>' +
        '</div>' +
        '<span class="badge">' + escapeHtml(question.tipo_interaccion) + '</span>' +
      '</div>' +
      '<p class="question-story">' + escapeHtml(question.reto) + '</p>' +
      (mediaHtml ? mediaHtml : '') +
      '<div class="question-challenge">' +
        interactionHtml +
      '</div>' +
      '<div class="button-row question-actions">' +
        '<button type="button" class="primary" data-question-verify="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>' + (complete ? 'Completada' : 'Verificar') + '</button>' +
        '<button type="button" class="secondary" data-question-hint="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>Ver pista</button>' +
      '</div>' +
      '<div class="hint-box hidden" data-question-hint-box="' + escapeHtmlAttr(key) + '">' + escapeHtml(question.pista) + '</div>' +
      '<div class="status-box" data-question-status="' + escapeHtmlAttr(key) + '">' + escapeHtml(statusText) + '</div>' +
    '</article>';
  }

  function setRoomStatus(message, type) {
    if (!els.roomStatusBox) return;
    els.roomStatusBox.textContent = message;
    els.roomStatusBox.className = 'status-box room-status-box' + (type ? ' is-' + type : '');
  }

  function setQuestionStatus(key, message, type) {
    const status = els.missionStage?.querySelector('[data-question-status="' + CSS.escape(key) + '"]');
    if (!status) return;
    status.textContent = message;
    status.className = 'status-box' + (type ? ' is-' + type : '');
  }

  function setQuestionCardCompleteState(key) {
    const card = els.missionStage?.querySelector('[data-question-card][data-question-key="' + CSS.escape(key) + '"]');
    if (!card) return;
    card.classList.add('is-complete');
    card.querySelectorAll('button, input, select, textarea').forEach((field) => {
      if (field.matches('[data-question-hint]')) return;
      field.disabled = true;
    });
    const verify = card.querySelector('[data-question-verify]');
    if (verify) verify.textContent = 'Completada';
  }

  function checkMatchingQuestion(question, key) {
    const selected = state.questionMatches[key] || {};
    const selectedValues = Object.values(selected).filter(Boolean);
    if (selectedValues.length !== question.parejas.length) return false;
    if (new Set(selectedValues).size !== question.parejas.length) return false;
    return question.parejas.every((pair, index) => selected[String(index)] === pair.derecha);
  }

  function markQuestionComplete(mission, question) {
    const key = getQuestionKey(mission, question);
    state.completedQuestions.add(key);
    setQuestionCardCompleteState(key);
    setQuestionStatus(key, question.retroalimentacion_correcta || 'Correcto.', 'good');
    persistProgressState();
    const completedCount = getCompletedQuestionCount(mission);
    const totalQuestions = getRoomQuestions(mission).length || 1;
    if (els.questionProgress) {
      els.questionProgress.innerHTML = 'Preguntas resueltas: <strong>' + completedCount + ' / ' + totalQuestions + '</strong>';
    }
    if (areMissionQuestionsCompleted(mission)) {
      markMissionComplete(mission);
      setRoomStatus('Sala completada. Se desbloquearon nuevas rutas.', 'good');
      renderMission();
      return;
    }
    setRoomStatus('Continúa resolviendo las preguntas de esta sala.', 'info');
  }

  function renderMission() {
    if (!els.missionStage) return;
    const mission = missionById(state.currentMissionId);
    if (!mission) {
      els.missionStage.innerHTML = '';
      return;
    }

    const questions = getRoomQuestions(mission);
    const completedCount = getCompletedQuestionCount(mission);
    const roomComplete = areMissionQuestionsCompleted(mission);
    const roomStatusText = roomComplete ? 'Sala completada. Listo para avanzar.' : 'Resuelve las preguntas en cualquier orden para desbloquear la siguiente sala.';
    const questionCards = questions.map((question, index) => renderQuestionCard(mission, question, index)).join('');

    els.missionStage.innerHTML =
      '<section class="mission-panel">' +
        '<div class="label">' + escapeHtml(mission.release) + '</div>' +
        '<h2 class="mission-title">' + escapeHtml(mission.titulo) + '</h2>' +
        '<p class="mission-story">' + escapeHtml(mission.historia) + '</p>' +
        '<div class="mission-layout">' +
          renderQuestionMedia(mission) +
          '<div class="challenge-box">' + escapeHtml(mission.reto) + '</div>' +
          '<div class="question-progress" id="questionProgress">Preguntas resueltas: <strong>' + completedCount + ' / ' + questions.length + '</strong></div>' +
          '<div class="status-box room-status-box" id="roomStatusBox">' + roomStatusText + '</div>' +
        '</div>' +
        '<div class="question-list">' + questionCards + '</div>' +
      '</section>';

    els.questionProgress = document.getElementById('questionProgress');
    els.roomStatusBox = document.getElementById('roomStatusBox');
    wireMissionEvents();
  }

  function markMissionComplete(mission) {
    state.completed.add(mission.id);
    (mission.desbloquea || []).forEach((targetId) => state.unlocked.add(targetId));
    persistProgressState();
    updateProgress();
    renderMap();
    if (areAllMissionsCompleted()) {
      setGalleryScreen('ending');
      return;
    }
    renderGallery();
  }

  function wireMissionEvents() {
    if (!els.missionStage || state.missionEventsBound) return;
    state.missionEventsBound = true;

    els.missionStage.addEventListener('click', (event) => {
      const hintButton = event.target.closest('[data-question-hint]');
      if (hintButton) {
        const key = hintButton.getAttribute('data-question-hint');
        const hintBox = els.missionStage?.querySelector('[data-question-hint-box="' + CSS.escape(key || '') + '"]');
        if (hintBox) hintBox.classList.remove('hidden');
        setQuestionStatus(key || '', 'Pista revelada. Ajusta tu lectura del reto.', 'good');
        return;
      }

      const choiceButton = event.target.closest('[data-question-choice]');
      if (choiceButton) {
        const key = choiceButton.getAttribute('data-question-choice') || '';
        const card = choiceButton.closest('[data-question-card]');
        if (!card) return;
        state.questionChoices[key] = Number(choiceButton.getAttribute('data-choice-index'));
        card.querySelectorAll('[data-question-choice="' + CSS.escape(key) + '"]').forEach((node) => node.classList.remove('is-selected'));
        choiceButton.classList.add('is-selected');
        persistProgressState();
        return;
      }

      const verifyButton = event.target.closest('[data-question-verify]');
      if (verifyButton) {
        const key = verifyButton.getAttribute('data-question-verify') || '';
        const mission = missionById(state.currentMissionId);
        if (!mission) return;
        const question = getRoomQuestions(mission).find((item) => getQuestionKey(mission, item) === key);
        if (!question) return;
        if (state.completedQuestions.has(key)) {
          setQuestionStatus(key, 'Esta pregunta ya estaba completada.', 'good');
          return;
        }

        let isCorrect = false;
        if (question.tipo_interaccion === 'opcion_multiple') {
          const selectedIndex = Number(state.questionChoices[key] ?? -1);
          const selected = question.opciones[selectedIndex] || '';
          isCorrect = getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(selected, question));
        } else if (question.tipo_interaccion === 'relacion_columnas') {
          isCorrect = checkMatchingQuestion(question, key);
        } else {
          const answerInput = els.missionStage.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
          const answer = answerInput ? answerInput.value || '' : (state.questionAnswers[key] || '');
          state.questionAnswers[key] = answer;
          isCorrect = getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(answer, question));
        }

        if (isCorrect) {
          markQuestionComplete(mission, question);
          return;
        }

        setQuestionStatus(key, question.retroalimentacion_incorrecta || 'Respuesta incorrecta. Intenta otra vez.', 'bad');
      }
    });

    els.missionStage.addEventListener('change', (event) => {
      const select = event.target.closest('[data-question-match-select]');
      if (!select) return;
      const key = select.getAttribute('data-question-match-select') || '';
      const index = select.getAttribute('data-match-index') || '0';
      if (!state.questionMatches[key]) state.questionMatches[key] = {};
      state.questionMatches[key][String(index)] = select.value || '';
      persistProgressState();
    });

    els.missionStage.addEventListener('input', (event) => {
      const input = event.target.closest('[data-question-answer]');
      if (!input) return;
      const key = input.getAttribute('data-question-answer') || '';
      state.questionAnswers[key] = input.value || '';
      persistProgressState();
    });
  }

  function render() {
    renderGallery();
    renderMap();
    renderMission();
    updateProgress();
  }

  els.galleryPrevButtons.forEach((button) => {
    button.addEventListener("click", goToPreviousGalleryScreen);
  });

  els.galleryNextButtons.forEach((button) => {
    button.addEventListener("click", goToNextGalleryScreen);
  });

  restoreProgressState();
  window.addEventListener("beforeunload", persistProgressState);
  window.addEventListener("pagehide", persistProgressState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistProgressState();
  });
  render();
})();
