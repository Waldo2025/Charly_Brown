import assert from "node:assert/strict";
import http from "node:http";

import { chromium } from "playwright";

import { buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const baseProject = {
  modo_presentacion: "menu_secciones",
  titulo: "Menu Runtime Determinista",
  subtitulo: "Dos actividades en orden",
  introduccion: "Conoce la misión antes de comenzar.",
  instrucciones: "Inicia el escape room y completa cada actividad en orden.",
  conclusion: "La clave final es NOVA.",
  duracion_minutos: 1,
  misiones: [
    {
      id: "actividad-uno",
      titulo: "Primera actividad",
      preguntas: [
        {
          id: "pregunta-uno",
          titulo: "Palabra secreta",
          reto: "Escribe la palabra correcta.",
          respuesta_correcta: "factor",
          respuestas_aceptadas: ["factor"]
        }
      ]
    },
    {
      id: "actividad-dos",
      titulo: "Segunda actividad",
      preguntas: [
        {
          id: "pregunta-dos",
          titulo: "Código secreto",
          reto: "Escribe el código correcto.",
          respuesta_correcta: "42",
          respuestas_aceptadas: ["42"],
          subtipo_respuesta: "numero"
        }
      ]
    }
  ]
};

const changedFingerprintProject = {
  ...baseProject,
  misiones: [
    { ...baseProject.misiones[0], id: "actividad-uno-editada" },
    baseProject.misiones[1]
  ]
};

const changedContentFingerprintProject = {
  ...baseProject,
  misiones: [
    {
      ...baseProject.misiones[0],
      preguntas: [{
        ...baseProject.misiones[0].preguntas[0],
        reto: "Escribe una respuesta nueva.",
        respuesta_correcta: "variable",
        respuestas_aceptadas: ["variable"]
      }]
    },
    baseProject.misiones[1]
  ]
};

const editedQuestionTypesProject = {
  modo_presentacion: "menu_secciones",
  titulo: "Tipos Interactivos Editados",
  subtitulo: "Validación integral de preguntas",
  introduccion: "Prueba cada interacción con su configuración editada.",
  instrucciones: "Inicia y completa las cuatro preguntas.",
  conclusion: "La clave final es TEST.",
  duracion_minutos: 5,
  misiones: [{
    id: "actividad-tipos-editados",
    titulo: "Actividad de tipos editados",
    preguntas: [
      {
        id: "texto-editado",
        titulo: "Texto editado",
        reto: "Escribe el código alternativo actualizado.",
        pista: "La pista textual también fue editada.",
        tipo_interaccion: "texto",
        subtipo_respuesta: "codigo_corto",
        respuesta_correcta: "NUEVA-42",
        respuestas_aceptadas: ["NUEVA-42", "CLAVE-42"]
      },
      {
        id: "opcion-editada",
        titulo: "Opción editada",
        reto: "Selecciona la respuesta configurada después de editar.",
        pista: "La opción central es correcta.",
        tipo_interaccion: "opcion_multiple",
        opciones: ["Respuesta anterior", "Respuesta correcta editada", "Distractor nuevo"],
        respuesta_correcta: "Respuesta correcta editada",
        respuestas_aceptadas: ["Respuesta correcta editada"]
      },
      {
        id: "relacion-editada",
        titulo: "Relaciones editadas",
        reto: "Completa las parejas modificadas.",
        pista: "Usa las definiciones actualizadas.",
        tipo_interaccion: "relacion_columnas",
        parejas: [
          { izquierda: "Término A editado", derecha: "Definición A editada" },
          { izquierda: "Término B editado", derecha: "Definición B editada" }
        ]
      },
      {
        id: "multimedia-editada",
        titulo: "Multimedia editada",
        reto: "Escribe el número del recurso actualizado.",
        pista: "Los ceros iniciales no cambian el valor.",
        tipo_interaccion: "multimedia",
        subtipo_respuesta: "numero",
        respuesta_correcta: "0073",
        respuestas_aceptadas: ["0073"],
        media: { tipo: "imagen", url: "data:image/png;base64,QUJDRA==", alt: "Recurso multimedia editado" }
      }
    ]
  }]
};

const autofillQuestionTypesProject = {
  ...editedQuestionTypesProject,
  titulo: "Tipos Interactivos Autocompletados",
  misiones: editedQuestionTypesProject.misiones.map((mission) => ({
    ...mission,
    preguntas: mission.preguntas.map((question) => (
      question.id === "texto-editado"
        ? { ...question, subtipo_respuesta: "frase_corta", respuesta_correcta: "pensamiento crítico", respuestas_aceptadas: ["pensamiento crítico"] }
        : question.id === "multimedia-editada"
        ? { ...question, respuesta_correcta: "1,073 unidades", respuestas_aceptadas: ["1,073 unidades"] }
        : { ...question }
    ))
  }))
};

const autofillRoomQuestionTypesProject = {
  ...editedQuestionTypesProject,
  modo_presentacion: "salas",
  titulo: "Sala con Tipos Interactivos Autocompletados"
};

const oneClickAutofillProject = {
  ...autofillQuestionTypesProject,
  titulo: "Autocompletado Editorial desde Portada"
};

const freeResponseProject = {
  modo_presentacion: "menu_secciones",
  titulo: "Respuesta Libre",
  introduccion: "Comparte una reflexión.",
  instrucciones: "Escribe cualquier respuesta no vacía.",
  conclusion: "La clave final es LIBRE.",
  misiones: [{
    id: "actividad-libre",
    titulo: "Reflexión libre",
    preguntas: [{
      id: "pregunta-libre",
      titulo: "Tu propuesta",
      reto: "Explica cómo cuidarías los libros de la biblioteca.",
      tipo_interaccion: "texto",
      subtipo_respuesta: "frase_libre",
      respuesta_correcta: "",
      respuestas_aceptadas: []
    }]
  }]
};

const academicColorsProject = {
  modo_presentacion: "menu_secciones",
  titulo: "Colores académicos por sala",
  nivel: "Primaria",
  unidad: "2",
  introduccion: "Comprueba la combinación de colores.",
  instrucciones: "Abre cada actividad.",
  conclusion: "La clave final es COLOR.",
  misiones: [
    { id: "color-uno", titulo: "Color uno", preguntas: [{ id: "color-q1", reto: "Responde.", respuesta_correcta: "uno" }] },
    { id: "color-dos", titulo: "Color dos", preguntas: [{ id: "color-q2", reto: "Responde.", respuesta_correcta: "dos" }] }
  ]
};
const academicRoomsProject = {
  ...academicColorsProject,
  modo_presentacion: "salas",
  titulo: "Colores académicos en lista de salas",
  nivel: "Secundaria",
  unidad: "",
  tema: "1",
  estacion: "Tercera estación"
};

const legacyRoomsProject = {
  titulo: "Salas Legacy Runtime",
  conclusion: "La clave final es SALA.",
  duracion_minutos: 1,
  misiones: [
    {
      id: "sala-legacy-uno",
      titulo: "Sala legacy",
      preguntas: [{ id: "legacy-q1", titulo: "Pregunta", reto: "Responde.", respuesta_correcta: "ok" }]
    }
  ]
};

const maliciousThemePayload = 'red;}</style><script>globalThis.__PIGPEN_THEME_XSS__="executed"</script><style>{x:y';
const safeThemeConfig = {
  backgroundColor: "#123456",
  titleColor: "#abcdef",
  buttonColor: "#654321"
};

const documents = {
  "/": buildPreviewDocument(baseProject, { editorialReview: true }),
  "/changed": buildPreviewDocument(changedFingerprintProject, { editorialReview: true }),
  "/changed-content": buildPreviewDocument(changedContentFingerprintProject, { editorialReview: true }),
  "/question-types": buildPreviewDocument(editedQuestionTypesProject, { editorialReview: true }),
  "/question-types-autofill": buildPreviewDocument(autofillQuestionTypesProject, { editorialReview: true }),
  "/room-question-types-autofill": buildPreviewDocument(autofillRoomQuestionTypesProject, { editorialReview: true }),
  "/one-click-autofill": buildPreviewDocument(oneClickAutofillProject, { editorialReview: true }),
  "/free-response": buildPreviewDocument(freeResponseProject, { editorialReview: true }),
  "/academic-colors": buildPreviewDocument(academicColorsProject, { editorialReview: true }),
  "/academic-rooms": buildPreviewDocument(academicRoomsProject, { editorialReview: true }),
  "/rooms": buildPreviewDocument(legacyRoomsProject, { editorialReview: true }),
  "/malicious-theme": buildPreviewDocument({
    ...baseProject,
    titulo: "Tema hostil",
    themeConfig: {
      backgroundColor: maliciousThemePayload,
      titleColor: maliciousThemePayload,
      buttonColor: maliciousThemePayload
    }
  }),
  "/safe-theme-menu": buildPreviewDocument({ ...baseProject, titulo: "Tema seguro menú", themeConfig: safeThemeConfig }),
  "/safe-theme-rooms": buildPreviewDocument({ ...legacyRoomsProject, titulo: "Tema seguro salas", themeConfig: safeThemeConfig })
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  if (pathname === "/logo.png") {
    response.writeHead(204);
    response.end();
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(documents[pathname] || documents["/"]);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Un progreso legacy con el mismo título no debe contaminar el modo menú.
await context.addInitScript(() => {
  localStorage.setItem("escapeRoomGame.progress.menuruntimedeterminista", JSON.stringify({
    completed: ["actividad-uno"],
    unlocked: ["actividad-uno", "actividad-dos"],
    isStarted: true
  }));
  localStorage.setItem("escapeRoomGame.progress.salaslegacyruntime", JSON.stringify({
    completed: ["sala-legacy-uno"],
    completedQuestions: ["sala-legacy-uno::legacy-q1"],
    unlocked: ["sala-legacy-uno"],
    currentMissionId: "sala-legacy-uno",
    galleryScreen: "mission",
    durationSeconds: 60,
    isStarted: true,
    isFinished: false,
    startedAtMs: Date.now(),
    endAtMs: Date.now() + 60_000,
    isMasterSolved: false
  }));
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });

  assert.equal(await page.locator("[data-menu-card]").count(), 5, "Debe renderizar N + 3 cards reales.");
  assert.equal(await page.locator("[data-menu-mission='actividad-uno']").isDisabled(), true, "La primera actividad inicia bloqueada.");
  assert.equal(await page.locator("[data-menu-mission='actividad-dos']").isDisabled(), true, "La segunda actividad inicia bloqueada.");
  assert.equal(await page.locator("[data-menu-section='ending']").isDisabled(), true, "El mensaje final inicia bloqueado.");

  const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(initialState.mode, "menu_secciones");
  assert.equal(initialState.progress.completed, 0, "El menú no debe migrar el save legacy de salas.");
  assert.equal(initialState.screen, "menu");

  const desktopColumns = await page.locator("#sectionsMenu").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(desktopColumns, 3, "El menú debe mostrar tres columnas en escritorio.");
  await page.setViewportSize({ width: 768, height: 1024 });
  const tabletColumns = await page.locator("#sectionsMenu").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(tabletColumns, 2, "El menú debe mostrar dos columnas en tablet.");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator("#sectionsMenu").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(mobileColumns, 1, "El menú debe mostrar una columna en móvil.");
  await page.setViewportSize({ width: 1440, height: 900 });

  const instructionsCard = page.locator("[data-menu-section='instructions']");
  await instructionsCard.focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-gallery-screen='instructions'].is-active").waitFor();
  assert.match(await page.locator("[data-gallery-screen='instructions']").innerText(), /completa cada actividad en orden/i);
  await page.locator("[data-gallery-screen='instructions'] [data-menu-back]").click();
  await page.waitForTimeout(30);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-menu-section")),
    "instructions",
    "Al volver, el foco debe regresar a la card de origen."
  );

  await page.locator("[data-game-start]").click();
  const startedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(startedState.screen, "menu", "Iniciar no debe sacar al jugador del menú.");
  assert.equal(startedState.started, true);
  assert.equal(await page.locator("[data-menu-mission='actividad-uno']").isDisabled(), false, "Iniciar debe habilitar la primera actividad.");
  assert.equal(await page.locator("[data-menu-mission='actividad-dos']").isDisabled(), true, "La segunda actividad debe seguir bloqueada.");

  await page.locator("[data-menu-mission='actividad-uno']").click();
  await page.locator("[data-question-answer]").fill("factor");
  await page.locator("[data-question-verify]").click();
  await page.locator("[data-gallery-screen='mission'] [data-menu-back]").last().click();
  await page.waitForTimeout(30);
  assert.equal(await page.locator("[data-menu-mission='actividad-dos']").isDisabled(), false, "Completar una actividad debe desbloquear solo la siguiente.");
  assert.match(await page.locator("[data-menu-mission='actividad-uno'] [data-menu-card-status]").innerText(), /completada/i);

  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(restoredState.progress.completed, 1, "La recarga debe restaurar el avance compatible.");
  assert.equal(await page.locator("[data-menu-mission='actividad-dos']").isDisabled(), false);
  const storedProgress = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.includes(".v3.menu_secciones."))
    .map(([, value]) => JSON.parse(value)));
  assert.ok(storedProgress.some((item) => item.version === 3 && item.mode === "menu_secciones" && item.fingerprint), "El save debe incluir versión, modo y huella.");

  await page.goto(`${origin}/changed`, { waitUntil: "domcontentloaded" });
  const incompatibleState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(incompatibleState.progress.completed, 0, "Una huella de actividades distinta no debe reutilizar el avance.");

  await page.goto(`${origin}/changed-content`, { waitUntil: "domcontentloaded" });
  const changedContentState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(
    changedContentState.progress.completed,
    0,
    "Cambiar contenido evaluable conservando IDs debe invalidar el avance anterior."
  );

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator("[data-menu-mission='actividad-dos']").click();
  await page.locator("[data-question-answer]").fill("42");
  await page.locator("[data-question-verify]").click();
  await page.locator("[data-gallery-screen='mission'] [data-menu-back]").last().click();
  assert.equal(await page.locator("[data-menu-section='ending']").isDisabled(), false, "Completar todas las actividades debe habilitar el mensaje final.");

  await page.locator("[data-menu-section='ending']").click();
  assert.equal(await page.locator("#masterPanelContainer").isVisible(), true, "La card final debe abrir el panel maestro.");
  await page.locator("#masterPasscodeInput").fill("NOVA");
  await page.locator("#btnVerifyMasterPasscode").click();
  await page.waitForTimeout(2200);
  assert.equal(await page.locator("#victoryContainer").isVisible(), true, "La clave correcta debe mostrar la victoria.");
  const victoryState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(victoryState.masterSolved, true);
  assert.ok(victoryState.remainingSeconds > 0, "La victoria debe conservar el tiempo restante.");
  assert.match(
    await page.locator("[data-gallery-screen='ending'] [data-timer-value]").innerText(),
    /^\d{2}:\d{2}$/,
    "La burbuja del temporizador debe mostrar únicamente la cuenta regresiva."
  );
  assert.match(
    await page.locator("[data-gallery-screen='ending'] [data-timer-shell]").getAttribute("class"),
    /is-complete/,
    "El temporizador debe usar un estado visual de éxito."
  );
  assert.match(await page.locator("#gameLiveStatus").innerText(), /escape room completado/i, "La región viva también debe anunciar la victoria.");
  assert.doesNotMatch(await page.locator("#gameLiveStatus").innerText(), /tiempo agotado/i);

  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredVictoryState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(restoredVictoryState.remainingSeconds, victoryState.remainingSeconds, "El tiempo restante de victoria debe quedar congelado tras recargar.");
  assert.equal(await page.locator("#victoryContainer").isVisible(), true);
  assert.match(await page.locator("[data-gallery-screen='ending'] [data-timer-value]").innerText(), /^\d{2}:\d{2}$/);

  await page.locator("[data-gallery-screen='ending'] [data-menu-back]").click();
  await page.locator("[data-game-reset]").click();
  await page.locator("[data-game-start]").click();
  const expiredState = JSON.parse(await page.evaluate(() => window.advanceTime(61_000)));
  assert.equal(expiredState.finished, true, "advanceTime debe poder agotar el temporizador sin esperas reales.");
  assert.equal(expiredState.remainingSeconds, 0);
  assert.equal(expiredState.screen, "menu", "La expiración desde el menú no debe dejar una pantalla vacía.");
  assert.equal(await page.locator("[data-menu-mission='actividad-uno']").isDisabled(), true, "El tiempo agotado debe bloquear actividades pendientes.");

  await page.goto(`${origin}/rooms`, { waitUntil: "domcontentloaded" });
  const migratedRoomsState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(migratedRoomsState.mode, "salas");
  assert.equal(migratedRoomsState.progress.completed, 1, "El modo salas debe conservar y migrar su progreso legacy.");
  const roomsMigration = await page.evaluate(() => ({
    legacy: localStorage.getItem("escapeRoomGame.progress.salaslegacyruntime"),
    versioned: Object.entries(localStorage)
      .filter(([key]) => key.includes("escapeRoomGame.progress.salaslegacyruntime.v3.salas."))
      .map(([, value]) => JSON.parse(value))
  }));
  assert.equal(roomsMigration.legacy, null, "La migración de salas debe retirar la clave legacy una vez guardado v2.");
  assert.ok(roomsMigration.versioned.some((item) => item.version === 3 && item.mode === "salas"), "La migración debe crear un save v3 para salas.");

  await page.goto(`${origin}/question-types`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='actividad-tipos-editados']").click();

  const textCard = page.locator("[data-question-key='actividad-tipos-editados::texto-editado']");
  await textCard.locator("[data-question-hint]").click();
  assert.match(await textCard.locator("[data-question-hint-box]").innerText(), /pista textual también fue editada/i, "El preview debe mostrar la pista textual editada.");
  await textCard.locator("[data-question-answer]").fill("Clave 42");
  await textCard.locator("[data-question-verify]").click();
  assert.match(await textCard.getAttribute("class"), /is-complete/, "La respuesta textual editada debe validarse.");

  const choiceCard = page.locator("[data-question-key='actividad-tipos-editados::opcion-editada']");
  await choiceCard.getByRole("button", { name: "Respuesta correcta editada", exact: true }).click();
  await choiceCard.locator("[data-question-verify]").click();
  assert.match(await choiceCard.getAttribute("class"), /is-complete/, "La opción correcta editada debe validarse.");

  const matchCard = page.locator("[data-question-key='actividad-tipos-editados::relacion-editada']");
  await page.setViewportSize({ width: 768, height: 1024 });
  const matchingLayout = await matchCard.locator(".match-row-grid").first().evaluate((row) => {
    const item = row.querySelector(".match-item")?.getBoundingClientRect();
    const select = row.querySelector(".match-select")?.getBoundingClientRect();
    return {
      item: item ? { x: item.x, width: item.width, height: item.height } : null,
      select: select ? { x: select.x, width: select.width, height: select.height } : null,
      columns: getComputedStyle(row).gridTemplateColumns
    };
  });
  assert.ok(matchingLayout.item?.width > 0 && matchingLayout.item?.height > 0, "El concepto de emparejamiento debe permanecer visible en el preview.");
  assert.ok(matchingLayout.select?.width > 0 && matchingLayout.select?.height > 0, "El selector de emparejamiento debe permanecer visible en el preview.");
  assert.ok(matchingLayout.item.x < matchingLayout.select.x, `El concepto debe quedar a la izquierda del selector: ${JSON.stringify(matchingLayout)}`);
  await matchCard.locator("[data-question-match-select]").nth(0).selectOption({ label: "Definición A editada" });
  await matchCard.locator("[data-question-match-select]").nth(1).selectOption({ label: "Definición B editada" });
  await matchCard.locator("[data-question-verify]").click();
  assert.match(await matchCard.getAttribute("class"), /is-complete/, "Las parejas editadas deben validarse.");
  await page.setViewportSize({ width: 1440, height: 900 });

  const mediaCard = page.locator("[data-question-key='actividad-tipos-editados::multimedia-editada']");
  assert.equal(await mediaCard.locator("img").getAttribute("alt"), "Recurso multimedia editado", "El preview debe usar el recurso multimedia editado.");
  await mediaCard.locator("[data-question-answer]").fill("73");
  await mediaCard.locator("[data-question-verify]").click();
  const editedTypesState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(editedTypesState.progress.completed, 1, "Completar los cuatro tipos editados debe completar la actividad.");

  await page.goto(`${origin}/question-types-autofill`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='actividad-tipos-editados']").click();
  await page.locator("[data-editorial-autofill]").click();
  const autofilledCards = page.locator("[data-question-card]");
  assert.equal(await autofilledCards.count(), 4, "El fixture editorial debe presentar los cuatro tipos interactivos.");
  assert.equal(await page.locator("[data-editorial-autofill]").innerText(), "Verificar respuestas", "El primer clic debe cambiar Autocompletar a Verificar.");
  const filledOnlyState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(filledOnlyState.progress.completed, 0, "El primer clic no debe validar todavía la actividad.");
  await page.locator("[data-editorial-autofill]").click();
  const autofilledTypesState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(autofilledTypesState.progress.completed, 1, "El segundo clic debe validar todos los tipos interactivos.");
  assert.equal(await page.locator("[data-question-card].is-complete").count(), 4, "Las cuatro preguntas autocompletadas deben quedar visualmente validadas.");

  await page.goto(`${origin}/room-question-types-autofill`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  await page.locator("[data-editorial-autofill]").click();
  assert.equal(await page.locator("[data-editorial-autofill]").innerText(), "Verificar respuestas");
  await page.locator("[data-editorial-autofill]").click();
  const autofilledRoomTypesState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(autofilledRoomTypesState.progress.completed, 1, "El flujo de dos clics también debe validar el modo por salas.");

  await page.goto(`${origin}/one-click-autofill`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-editorial-autofill]").click();
  const oneClickAutofillState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(oneClickAutofillState.started, true, "Autocompletar desde la portada debe iniciar el preview editorial.");
  assert.equal(oneClickAutofillState.screen, "mission", "Autocompletar desde el menú debe abrir la siguiente actividad editable.");
  assert.equal(oneClickAutofillState.progress.completed, 0, "El primer clic desde portada solo debe rellenar respuestas.");
  assert.equal(await page.locator("[data-question-card]").count(), 4, "La actividad preparada debe conservar todas sus preguntas.");
  assert.equal(
    await page.locator("[data-question-key='actividad-tipos-editados::texto-editado'] [data-question-answer]").evaluate((input) => input.value),
    "pensamiento",
    "Autocompletar debe usar la clave abierta normalizada a una sola palabra."
  );
  assert.equal(
    await page.locator("[data-question-answer].is-number").getAttribute("inputmode"),
    "decimal",
    "Las respuestas numéricas formateadas deben permanecer editables antes de verificar."
  );
  const oneClickControls = await page.evaluate(() => Array.from(document.querySelectorAll("[data-question-card]")).map((card) => ({
    key: card.getAttribute("data-question-key"),
    complete: card.classList.contains("is-complete")
  })));
  assert.ok(oneClickControls.every((control) => !control.complete), `Autocompletar no debe verificar antes del segundo clic: ${JSON.stringify(oneClickControls)}`);
  await page.locator("[data-editorial-autofill]").click();
  const oneClickVerifiedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(oneClickVerifiedState.progress.completed, 1, "El segundo clic desde portada debe verificar y completar la actividad.");

  await page.goto(`${origin}/free-response`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='actividad-libre']").click();
  const freeResponseField = page.locator("[data-question-key='actividad-libre::pregunta-libre'] [data-question-answer]");
  assert.equal(await freeResponseField.evaluate((field) => field.tagName), "TEXTAREA", "La frase libre debe usar un área de texto.");
  assert.equal(await freeResponseField.getAttribute("spellcheck"), "true", "La frase libre debe solicitar revisión ortográfica al navegador.");
  await page.locator("[data-question-verify]").click();
  assert.doesNotMatch(await page.locator("[data-question-card]").getAttribute("class"), /is-complete/, "Una frase libre vacía no debe completarse.");
  assert.match(await page.locator("[data-question-status]").innerText(), /escribe una respuesta/i, "Debe explicar que la respuesta no puede quedar vacía.");
  await freeResponseField.fill("Yo ordenaría los libros y cuidaría el espacio compartido.");
  await page.locator("[data-question-verify]").click();
  assert.match(await page.locator("[data-question-card]").getAttribute("class"), /is-complete/, "Cualquier frase libre no vacía debe considerarse correcta.");

  await page.goto(`${origin}/academic-colors`, { waitUntil: "domcontentloaded" });
  const activityPaletteVars = await page.locator("[data-menu-mission]").evaluateAll((cards) => cards.map((card) => ({
    station: card.style.getPropertyValue("--room-station-color"),
    theme: card.style.getPropertyValue("--room-theme-color")
  })));
  assert.deepEqual(activityPaletteVars, [
    { station: "#fcc659", theme: "#ea5a5a" },
    { station: "#bbd152", theme: "#ea5a5a" }
  ], "La lista debe combinar una estación por sala con el color común de Unidad 2.");
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='color-uno']").click();
  const missionPaletteVars = await page.locator(".mission-panel[data-room-palette]").evaluate((panel) => ({
    station: getComputedStyle(panel).getPropertyValue("--room-station-color").trim(),
    theme: getComputedStyle(panel).getPropertyValue("--room-theme-color").trim(),
    button: getComputedStyle(panel.querySelector(".primary")).backgroundColor
  }));
  assert.deepEqual(missionPaletteVars, { station: "#fcc659", theme: "#ea5a5a", button: "rgb(234, 90, 90)" }, "La sala y sus botones deben recibir la combinación académica.");

  await page.goto(`${origin}/academic-rooms`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  const roomMapPaletteVars = await page.locator(".map-card").evaluateAll((cards) => cards.map((card) => ({
    station: card.style.getPropertyValue("--room-station-color"),
    theme: card.style.getPropertyValue("--room-theme-color")
  })));
  assert.deepEqual(roomMapPaletteVars, [
    { station: "#e95297", theme: "#2da6b1" },
    { station: "#e95297", theme: "#2da6b1" }
  ], "La lista de salas debe usar la estación explícita y Tema 1 en cada botón.");

  await page.goto(`${origin}/malicious-theme`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => globalThis.__PIGPEN_THEME_XSS__), undefined, "Chromium no debe ejecutar contenido inyectado mediante colores del tema.");
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()),
    "#2da6b1",
    "El preview debe mantener el color académico del tema/unidad aunque la configuración visual incluya un fondo no confiable."
  );

  for (const route of ["safe-theme-menu", "safe-theme-rooms"]) {
    await page.goto(`${origin}/${route}`, { waitUntil: "domcontentloaded" });
    if (route === "safe-theme-rooms") {
      const previous = page.locator("[data-gallery-prev]");
      assert.equal(await previous.isVisible(), false, "En la portada del modo salas no debe verse Previous.");
      assert.equal(await previous.getAttribute("aria-hidden"), "true", "Previous tampoco debe anunciarse antes de que exista una pantalla anterior.");
      assert.equal(await previous.isDisabled(), true, "Previous debe iniciar inactivo en modo salas.");
    }
    const appliedTheme = await page.evaluate(() => ({
      background: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      title: getComputedStyle(document.documentElement).getPropertyValue("--title-color").trim(),
      button: getComputedStyle(document.documentElement).getPropertyValue("--button-bg").trim()
    }));
    assert.deepEqual(appliedTheme, { background: "#2da6b1", title: "#abcdef", button: "#654321" }, `${route} debe priorizar el fondo académico y conservar los demás colores válidos.`);
  }

  assert.deepEqual(pageErrors, [], `No debe haber errores de página: ${pageErrors.join(" | ")}`);
  console.log("Escape room menu runtime OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
