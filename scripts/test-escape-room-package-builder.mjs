import assert from "node:assert/strict";
import vm from "node:vm";

import { normalizeEscapeRoomProject } from "../public/js/escape-room-creator-model.mjs";
import { buildEscapeRoomPackage, buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = normalizeEscapeRoomProject({
  titulo: "Boveda Algebraica",
  introduccion: "Recupera la clave final.",
  conclusion: "La boveda se abre.",
  backgroundImage: "data:image/png;base64,QUJDRA==",
  misiones: [
    {
      id: "m1",
      titulo: "Sala con dos preguntas",
      preguntas: [
        {
          id: "q1",
          titulo: "Texto secreto",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          reto: "Escribe la palabra secreta.",
          respuesta_correcta: "factor",
          respuestas_aceptadas: ["factor"],
          media: {
            tipo: "imagen",
            url: "data:image/png;base64,QUJDRA==",
            alt: "Pista visual de la primera pregunta"
          }
        },
        {
          id: "q2",
          titulo: "Opcion interna",
          tipo_interaccion: "opcion_multiple",
          subtipo_respuesta: "palabra",
          reto: "Elige la opcion correcta.",
          opciones: ["A", "B", "C"],
          respuesta_correcta: "B",
          respuestas_aceptadas: ["B"]
        }
      ],
      desbloquea: ["m2"]
    },
    {
      id: "m2",
      titulo: "Pista visual",
      preguntas: [
        {
          id: "q3",
          titulo: "Multimedia interna",
          tipo_interaccion: "multimedia",
          subtipo_respuesta: "numero",
          reto: "Lee la imagen y responde.",
          respuesta_correcta: "12",
          media: {
            tipo: "imagen",
            url: "data:image/png;base64,QUJDRA==",
            alt: "Tarjeta con el numero 12"
          }
        }
      ]
    }
  ]
});

const pkg = buildEscapeRoomPackage(project);

const themedPackage = buildEscapeRoomPackage({
  titulo: "Tema persistente",
  themeConfig: { presetId: "jadeNight", baseColor: "#10b981", backgroundColor: "#061a13", cardRadius: 14 },
  misiones: []
});
const themedManifest = JSON.parse(themedPackage.files["assets/escape-room.json"]);
assert.deepEqual(
  themedManifest.themeConfig,
  { presetId: "jadeNight", baseColor: "#10b981", backgroundColor: "#061a13", cardRadius: 14 },
  "El manifiesto exportado debe conservar themeConfig para que el ZIP sea reeditable."
);

assert.equal(pkg.downloadName, "EscapeRoom_Boveda_Algebraica", "Debe generar un nombre de paquete estable.");
assert.ok(pkg.files["index.html"], "Debe incluir index.html.");
assert.ok(pkg.files["assets/game.css"], "Debe incluir CSS del juego.");
assert.ok(pkg.files["assets/game.js"], "Debe incluir JS del juego.");
assert.ok(pkg.files["assets/escape-room.json"], "Debe incluir el JSON normalizado.");
assert.ok(pkg.files["assets/media/m1-q1-media.png"], "Debe extraer la media de una pregunta interna.");
assert.ok(pkg.files["assets/media/m2-q3-media.png"], "Debe extraer la media de una segunda pregunta interna.");
assert.ok(pkg.files["assets/media/Boveda_Algebraica-background.png"], "Debe extraer la imagen de portada de fondo.");
assert.match(pkg.files["index.html"], /assets\/game\.css/, "El index debe referenciar el CSS empaquetado.");
assert.match(pkg.files["index.html"], /assets\/game\.js/, "El index debe referenciar el JS empaquetado.");
assert.match(pkg.files["index.html"], /Boveda_Algebraica-background\.png/, "El index debe usar la imagen de portada exportada.");
assert.match(pkg.files["index.html"], /data-gallery-next/, "El hero-panel debe incluir un botón para pasar a la siguiente sección.");
assert.match(pkg.files["index.html"], /data-gallery-screen="intro"/, "El export debe separar la sección de inicio como galería.");
assert.match(pkg.files["index.html"], /data-gallery-screen="mission"/, "El export debe separar la sección de mapa y misión como galería.");
assert.doesNotMatch(pkg.files["index.html"], /Temporizador|Listo para iniciar/, "El export debe mostrar el tiempo como una burbuja sin etiquetas de estado.");
assert.doesNotMatch(pkg.files["assets/game.js"], /Escape room en curso/, "El runtime no debe inyectar estados textuales dentro de la burbuja del tiempo.");
assert.match(pkg.files["assets/game.js"], /data-question-card/, "El runtime debe renderizar tarjetas de preguntas internas por sala.");
assert.match(pkg.files["assets/game.js"], /questionProgress/, "El runtime debe mostrar progreso interno por sala.");
assert.match(pkg.files["index.html"], /ending-media/, "El panel de victoria debe incluir una imagen representativa.");
assert.doesNotMatch(pkg.files["index.html"], /Roster/i, "El export no debe incluir la sección Roster.");
assert.match(pkg.files["assets/game.js"], /const ESCAPE_ROOM_DATA =/, "El JS debe hidratar el proyecto.");
assert.match(pkg.files["assets/game.js"], /mapa libre/i, "El runtime debe describir navegación libre.");
assert.match(pkg.files["assets/game.js"], /data-question-match-select=/, "El runtime debe renderizar emparejamiento por select dentro de cada pregunta.");
assert.match(
  pkg.files["assets/game.css"],
  /\.question-challenge \.match-row-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/,
  "Cada emparejamiento debe dividir el concepto a la izquierda y el selector a la derecha."
);
assert.match(
  pkg.files["assets/game.css"],
  /@media \(max-width: 560px\)[\s\S]*?\.question-challenge \.match-row-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/,
  "El emparejamiento debe apilarse únicamente en móviles estrechos para evitar overflow."
);
assert.match(pkg.files["assets/game.js"], /function escapeHtmlAttr\(/, "El runtime debe incluir el helper escapeHtmlAttr.");
assert.match(pkg.files["assets/game.js"], /galleryScreen/, "El runtime debe manejar la navegación por galerías.");
assert.match(pkg.files["assets/game.js"], /questionProgress/, "El runtime debe manejar preguntas internas por sala.");
assert.match(pkg.files["assets/game.js"], /localStorage/, "El runtime debe persistir el avance en localStorage.");
assert.match(pkg.files["assets/game.js"], /progressStorageKey|saveProgressState|restoreProgressState/, "El runtime debe definir una clave de persistencia para el avance.");
assert.match(pkg.files["assets/game.js"], /const ESCAPE_ROOM_FINAL_PASSCODE =/, "El runtime debe hidratar una clave final garantizada.");
assert.match(pkg.files["index.html"], /Panel de Control Maestro/, "El flujo final debe seguir mostrando el panel maestro.");
assert.match(pkg.files["assets/game.css"], /\.ending-panel\.is-alert/, "El CSS debe poder hacer parpadear el ending panel en rojo.");
assert.match(pkg.files["assets/game.js"], /function syncEndingAlertState\(/, "El runtime debe sincronizar el estado visual y sonoro de alerta del ending panel.");
assert.match(pkg.files["assets/game.js"], /function startAlertSound\(/, "El runtime debe exponer un arranque del sonido de alerta.");
assert.match(pkg.files["assets/game.js"], /function stopAlertSound\(/, "El runtime debe exponer un apagado del sonido de alerta.");
assert.doesNotMatch(pkg.files["assets/game.js"], /data-match-left=|data-match-right=/, "No debe usar el matching antiguo por columnas de botones.");
assert.doesNotMatch(pkg.files["index.html"], /<img src="Terminal de computadora antigua/i, "No debe renderizar descripciones largas como src de imagen.");
assert.doesNotThrow(() => new vm.Script(pkg.files["assets/game.js"]), "El JS empaquetado debe tener sintaxis válida.");

const fallbackProject = normalizeEscapeRoomProject({
  titulo: "Operacion Centinela",
  introduccion: "Desactiva el sistema final.",
  conclusion: "El sistema central se apaga cuando el equipo completa la misión.",
  misiones: [{ id: "m1", titulo: "Sala 1", preguntas: [{ id: "q1", titulo: "Clave", reto: "Resuelve", respuesta_correcta: "ok" }] }]
});

const fallbackPkg = buildEscapeRoomPackage(fallbackProject);
assert.match(
  fallbackPkg.files["assets/game.js"],
  /const ESCAPE_ROOM_FINAL_PASSCODE = "[A-Z0-9]{4,8}";/,
  "El runtime debe generar una clave final de respaldo cuando la conclusión no la incluye."
);

const sectionMenuProject = normalizeEscapeRoomProject({
  modo_presentacion: "menu_secciones",
  titulo: "Misión por secciones",
  subtitulo: "Elige tu siguiente actividad",
  introduccion: "Conoce la historia antes de comenzar.",
  instrucciones: "Lee <con calma> & completa cada actividad en orden.",
  conclusion: "La clave final es NOVA.",
  backgroundImage: "data:image/png;base64,QUJDRA==",
  misiones: [
    {
      id: "actividad-1",
      titulo: "Observa el patrón",
      contexto: "El patrón alterna triángulos y círculos; el triángulo inicia cada serie.",
      datos_clave: ["El triángulo inicia la serie.", "Las figuras se alternan."],
      media: { tipo: "imagen", url: "https://example.com/patron.png", alt: "Patrón geométrico" },
      preguntas: [{ id: "menu-q1", titulo: "Patrón", reto: "Responde.", respuesta_correcta: "triángulo" }]
    },
    {
      id: "actividad-2",
      titulo: "Descifra el código",
      preguntas: [{ id: "menu-q2", titulo: "Código", reto: "Responde.", respuesta_correcta: "42" }]
    }
  ]
});

const sectionMenuPkg = buildEscapeRoomPackage(sectionMenuProject);
const sectionMenuHtml = sectionMenuPkg.files["index.html"];
const sectionMenuJs = sectionMenuPkg.files["assets/game.js"];
const sectionMenuCss = sectionMenuPkg.files["assets/game.css"];
const sectionMenuJson = JSON.parse(sectionMenuPkg.files["assets/escape-room.json"]);
const sectionCardCount = (sectionMenuHtml.match(/<button\b[^>]*\bdata-menu-card(?:\s|>)/g) || []).length;

assert.equal(sectionMenuJson.modo_presentacion, "menu_secciones", "El paquete debe conservar el modo por secciones.");
assert.equal(sectionMenuJson.instrucciones, sectionMenuProject.instrucciones, "El paquete debe conservar las instrucciones editables.");
assert.equal(sectionMenuJson.misiones[0].contexto, sectionMenuProject.misiones[0].contexto, "El manifiesto debe conservar el expediente de contexto.");
assert.deepEqual(sectionMenuJson.misiones[0].datos_clave, sectionMenuProject.misiones[0].datos_clave, "El manifiesto debe conservar las evidencias clave.");
assert.equal(sectionCardCount, sectionMenuProject.misiones.length + 3, "El menú debe incluir exactamente N + 3 cards.");
assert.match(sectionMenuHtml, /data-gallery-screen="menu"/, "El modo por secciones debe incluir un menú principal dedicado.");
assert.match(sectionMenuHtml, /data-gallery-screen="instructions"/, "El modo por secciones debe incluir una vista dedicada de instrucciones.");
assert.match(sectionMenuHtml, /data-menu-section="ending"/, "El menú debe incluir la card de mensaje final.");
assert.match(sectionMenuHtml, /Lee &lt;con calma&gt; &amp; completa/, "Las instrucciones deben escaparse al renderizarse.");
assert.match(sectionMenuHtml, /assets\/media\/Mision_por_secciones-background\.png/, "La card y la introducción deben usar la portada extraída.");
assert.match(sectionMenuHtml, /https:\/\/example\.com\/patron\.png/, "Las cards deben conservar assets remotos renderizables.");
assert.match(sectionMenuHtml, /section-card-fallback-instructions/, "Las secciones sin asset deben usar un fallback SVG/CSS integrado.");
assert.doesNotMatch(sectionMenuHtml, /data-gallery-(?:prev|next)/, "El modo menú no debe mostrar controles Anterior/Siguiente.");
assert.match(sectionMenuHtml, /aria-live="polite"/, "El menú debe exponer feedback accesible mediante una región viva.");
assert.match(sectionMenuCss, /\.sections-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/,
  "El menú debe usar tres columnas en escritorio.");
assert.match(sectionMenuCss, /@media \(max-width: 900px\)[\s\S]*\.sections-grid\s*\{\s*grid-template-columns:\s*repeat\(2,/,
  "El menú debe usar dos columnas en tablet.");
assert.match(sectionMenuCss, /@media \(max-width: 560px\)[\s\S]*\.sections-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/,
  "El menú debe usar una columna en móvil.");
assert.match(sectionMenuCss, /@media \(prefers-reduced-motion: reduce\)/, "El CSS debe respetar movimiento reducido.");
assert.match(sectionMenuJs, /ESCAPE_ROOM_PRESENTATION_MODE = "menu_secciones"/, "El runtime debe hidratar el modo por secciones.");
assert.match(sectionMenuJs, /ESCAPE_ROOM_PROGRESS_VERSION = 3/, "La persistencia debe estar versionada.");
assert.match(sectionMenuJs, /ESCAPE_ROOM_PROGRESS_FINGERPRINT = "[a-z0-9]+"/, "La persistencia debe incluir una huella estable.");
assert.match(sectionMenuJs, /if \(!raw && !IS_MENU_MODE\)/, "Solo el modo salas debe migrar el progreso legacy.");
assert.match(sectionMenuJs, /function syncMenuUnlocksFromProgress\(/, "El menú debe reconstruir el desbloqueo secuencial.");
assert.match(sectionMenuJs, /window\.render_game_to_text = renderGameToText/, "El runtime debe exponer una salida textual estable.");
assert.match(sectionMenuJs, /window\.advanceTime = advanceTime/, "El runtime debe exponer control temporal determinista.");
assert.match(sectionMenuJs, /readBriefings: new Set\(/, "El runtime debe persistir la lectura del expediente.");
assert.match(sectionMenuCss, /\.investigation-board\s*\{/, "El ZIP debe incluir el tablero de investigación.");
assert.match(sectionMenuJs, /const ESCAPE_ROOM_FINAL_PASSCODE = "NOVA";/, "La clave final debe extraerse completa y no confundir la palabra 'final'.");
assert.doesNotThrow(() => new vm.Script(sectionMenuJs), "El runtime por secciones debe tener sintaxis válida.");

const scriptBoundaryPayload = "</script><script>globalThis.__pigpenInjected = true</script>";
const hostilePreview = buildPreviewDocument({
  modo_presentacion: "menu_secciones",
  titulo: scriptBoundaryPayload,
  instrucciones: scriptBoundaryPayload,
  misiones: [{
    id: "actividad-hostil",
    titulo: scriptBoundaryPayload,
    preguntas: [{ id: "pregunta-hostil", reto: "Responde.", respuesta_correcta: "ok" }]
  }]
});
assert.doesNotMatch(
  hostilePreview,
  /<\/script><script>globalThis\.__pigpenInjected/,
  "El contenido editable no debe poder cerrar el script del preview."
);
assert.match(
  hostilePreview,
  /\\u003c\/script\\u003e\\u003cscript\\u003e/,
  "El proyecto hidratado debe neutralizar límites de script."
);

const maliciousThemeValue = 'red;}</style><script>globalThis.__PIGPEN_THEME_XSS__="executed"</script><style>{x:y';
const maliciousThemePreview = buildPreviewDocument({
  modo_presentacion: "menu_secciones",
  titulo: "Tema no confiable",
  themeConfig: {
    backgroundColor: maliciousThemeValue,
    titleColor: maliciousThemeValue,
    buttonColor: maliciousThemeValue
  },
  misiones: []
});
assert.doesNotMatch(maliciousThemePreview, /__PIGPEN_THEME_XSS__|<\/style><script>/i, "Los colores no confiables no deben poder cerrar el bloque style.");
assert.match(maliciousThemePreview, /--bg:\s*#12091d;/, "Un color de fondo inválido debe usar el fallback estable.");
assert.match(maliciousThemePreview, /--title-color:\s*#f5eefe;/, "Un color de título inválido debe usar el fallback estable.");

for (const modo_presentacion of ["salas", "menu_secciones"]) {
  const safeThemePreview = buildPreviewDocument({
    modo_presentacion,
    titulo: `Paleta ${modo_presentacion}`,
    themeConfig: {
      backgroundColor: "#123456",
      titleColor: "#abcdef",
      buttonColor: "#654321"
    },
    misiones: []
  });
  assert.match(safeThemePreview, /--bg:\s*#123456;/, `${modo_presentacion} debe conservar un fondo hexadecimal válido.`);
  assert.match(safeThemePreview, /--title-color:\s*#abcdef;/, `${modo_presentacion} debe conservar un título hexadecimal válido.`);
  assert.match(safeThemePreview, /--button-bg:\s*#654321;/, `${modo_presentacion} debe conservar un botón hexadecimal válido.`);
}

const academicPalettePreview = buildPreviewDocument({
  modo_presentacion: "salas",
  titulo: "Paleta académica",
  themeConfig: {
    baseColor: "#236f7b",
    buttonColor: "#2da6b1",
    accentColor: "#fcc659"
  },
  misiones: []
});
assert.match(academicPalettePreview, /--button-bg:\s*#2da6b1;/, "El preview debe usar el color del tema en los botones.");
assert.match(academicPalettePreview, /--accent:\s*#fcc659;/, "El preview debe usar el color de la estación como acento.");
assert.match(academicPalettePreview, /button\s*\{[\s\S]*font-size:\s*0\.78rem;[\s\S]*font-weight:\s*400;/, "Los botones del escape room deben usar tipografía compacta de peso normal.");
assert.match(academicPalettePreview, /\.title \{ font-size: clamp\(1\.3rem, 2\.2vw, 32px\)/, "El título del preview debe usar una escala más compacta.");
assert.match(academicPalettePreview, /\.timer-fab \{[\s\S]*left: 18px;[\s\S]*right: auto;[\s\S]*width: fit-content;/, "El temporizador flotante debe permanecer compacto y alineado a la izquierda.");
assert.match(academicPalettePreview, /\.muted, \.status-note, \.mission-story, \.map-help \{[^}]*font-size: 14px;/, "Los párrafos del preview deben usar una escala más pequeña.");

const academicPalettePkg = buildEscapeRoomPackage({
  modo_presentacion: "menu_secciones",
  titulo: "Paleta académica exportada",
  themeConfig: {
    baseColor: "#236f7b",
    buttonColor: "#2da6b1",
    accentColor: "#fcc659"
  },
  misiones: []
});
assert.match(academicPalettePkg.files["assets/game.css"], /--button-bg:\s*#2da6b1;/, "El ZIP debe exportar el color del tema.");
assert.match(academicPalettePkg.files["assets/game.css"], /--accent:\s*#fcc659;/, "El ZIP debe exportar el color de la estación.");

const combinedRoomPalettePkg = buildEscapeRoomPackage({
  modo_presentacion: "menu_secciones",
  titulo: "Paletas combinadas por sala",
  nivel: "Primaria",
  unidad: "2",
  misiones: [
    { id: "sala-color-1", titulo: "Sala color 1", preguntas: [{ respuesta_correcta: "uno" }] },
    { id: "sala-color-2", titulo: "Sala color 2", preguntas: [{ respuesta_correcta: "dos" }] }
  ]
});
const combinedRoomPaletteJson = JSON.parse(combinedRoomPalettePkg.files["assets/escape-room.json"]);
assert.equal(combinedRoomPaletteJson.misiones[0].paleta_academica.color_estacion, "#fcc659", "La primera sala debe usar Estación 1.");
assert.equal(combinedRoomPaletteJson.misiones[1].paleta_academica.color_estacion, "#bbd152", "La segunda sala debe usar Estación 2.");
assert.ok(combinedRoomPaletteJson.misiones.every((mission) => mission.paleta_academica.color_tema_unidad === "#ea5a5a"), "Todas las salas de Unidad 2 deben conservar su color de unidad.");
assert.match(combinedRoomPalettePkg.files["assets/game.css"], /--bg:\s*#ea5a5a;/, "El fondo exportado debe usar el color de la unidad seleccionada.");
assert.match(buildPreviewDocument(combinedRoomPaletteJson), /--bg:\s*#ea5a5a;/, "El preview debe usar el mismo color de unidad que el ZIP.");
assert.match(combinedRoomPalettePkg.files["index.html"], /data-menu-mission="sala-color-1"[^>]*--room-station-color:#fcc659;--room-theme-color:#ea5a5a;/, "La card de la primera sala debe combinar estación y unidad.");
assert.match(combinedRoomPalettePkg.files["index.html"], /data-menu-mission="sala-color-2"[^>]*--room-station-color:#bbd152;--room-theme-color:#ea5a5a;/, "La card de la segunda sala debe combinar su estación con la misma unidad.");
assert.match(combinedRoomPalettePkg.files["assets/game.css"], /\.mission-panel\[data-room-palette\] \.primary[\s\S]*background: var\(--room-theme-color\)/, "Los botones principales de cada sala deben usar el color de tema/unidad.");
assert.match(combinedRoomPalettePkg.files["assets/game.css"], /\.mission-panel\[data-room-palette\] \.secondary[\s\S]*--room-station-color/, "Los botones secundarios deben usar el color de estación.");
assert.match(combinedRoomPalettePkg.files["assets/game.css"], /\.section-card\[data-menu-mission\][\s\S]*--room-station-color[\s\S]*--room-theme-color/, "La lista de actividades debe combinar ambos colores.");

const secondaryStationPkg = buildEscapeRoomPackage({
  modo_presentacion: "salas",
  titulo: "Estación fija y Tema 1",
  nivel: "Secundaria",
  tema: "1",
  estacion: "Tercera estación",
  misiones: [
    { id: "sec-1", preguntas: [{ respuesta_correcta: "uno" }] },
    { id: "sec-2", preguntas: [{ respuesta_correcta: "dos" }] }
  ]
});
const secondaryStationJson = JSON.parse(secondaryStationPkg.files["assets/escape-room.json"]);
assert.ok(secondaryStationJson.misiones.every((mission) => mission.paleta_academica.color_estacion === "#e95297"), "Una estación explícita de Secundaria debe aplicarse a todas las salas.");
assert.ok(secondaryStationJson.misiones.every((mission) => mission.paleta_academica.color_tema_unidad === "#2da6b1"), "Tema 1 debe aplicarse a elementos de todas las salas.");
assert.match(secondaryStationPkg.files["assets/game.css"], /--bg:\s*#2da6b1;/, "El fondo de Secundaria debe usar el color del tema seleccionado.");

const editedQuestionProject = {
  modo_presentacion: "salas",
  titulo: "Sincronización editorial",
  misiones: [{
    id: "mision-editada",
    titulo: "Sala editada",
    preguntas: [{
      id: "pregunta-editada",
      titulo: "Pregunta actualizada",
      reto: "Reto actualizado desde el editor",
      pista: "Pista actualizada desde el editor",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "respuesta nueva",
      respuestas_aceptadas: ["respuesta nueva", "alias nuevo"]
    }]
  }]
};
const editedQuestionPkg = buildEscapeRoomPackage(editedQuestionProject);
const editedQuestionJson = JSON.parse(editedQuestionPkg.files["assets/escape-room.json"]);
const editedQuestionPreview = buildPreviewDocument(editedQuestionProject, { editorialReview: true });
const exportedEditedQuestion = editedQuestionJson.misiones[0].preguntas[0];

assert.equal(exportedEditedQuestion.reto, "Reto actualizado desde el editor Responde con una sola palabra.", "El ZIP debe conservar el reto editado y aclarar el contrato de una palabra.");
assert.equal(exportedEditedQuestion.pista, "Pista actualizada desde el editor", "El ZIP debe conservar la pista editada.");
assert.equal(exportedEditedQuestion.respuesta_correcta, "respuesta", "El ZIP debe reducir una respuesta abierta editada a una sola palabra.");
assert.deepEqual(exportedEditedQuestion.respuestas_aceptadas, ["respuesta", "alias"], "El ZIP debe conservar únicamente variantes abiertas de una palabra.");
assert.match(editedQuestionPreview, /Reto actualizado desde el editor/, "El preview debe recibir el reto editado.");
assert.match(editedQuestionPreview, /Pista actualizada desde el editor/, "El preview debe recibir la pista editada.");
assert.match(editedQuestionPreview, /\"respuesta_correcta\"\s*:\s*\"respuesta\"/, "El preview debe recibir la respuesta abierta ya normalizada a una palabra.");

const freeResponsePackage = buildEscapeRoomPackage({
  titulo: "Frase libre exportable",
  misiones: [{
    id: "sala-libre",
    preguntas: [{
      id: "pregunta-libre",
      titulo: "Reflexión",
      reto: "Explica qué aprendiste.",
      tipo_interaccion: "texto",
      subtipo_respuesta: "frase_libre",
      respuesta_correcta: "",
      respuestas_aceptadas: []
    }]
  }]
});
const freeResponseJson = JSON.parse(freeResponsePackage.files["assets/escape-room.json"]);
assert.equal(freeResponseJson.misiones[0].preguntas[0].subtipo_respuesta, "frase_libre", "El ZIP debe conservar la configuración de frase libre.");
assert.match(freeResponsePackage.files["assets/game.js"], /spellcheck="true"/, "El runtime exportado debe activar la ayuda ortográfica.");
assert.match(freeResponsePackage.files["assets/game.js"], /question\.subtipo_respuesta === 'frase_libre'/, "El runtime exportado debe validar cualquier frase no vacía.");
assert.match(freeResponsePackage.files["assets/game.css"], /\.game-header \.is-concealed/, "El ZIP debe incluir el estado visual que oculta Previous en la portada.");
assert.match(freeResponsePackage.files["index.html"], /data-gallery-prev aria-hidden="true" tabindex="-1" disabled/, "Previous debe iniciar oculto e inactivo en el ZIP.");

const editedInteractiveTypesProject = {
  modo_presentacion: "menu_secciones",
  titulo: "Edición de todos los tipos",
  misiones: [{
    id: "actividad-tipos",
    titulo: "Actividad interactiva",
    preguntas: [
      {
        id: "texto-editado",
        titulo: "Texto editado",
        reto: "Reto textual actualizado",
        pista: "Pista textual actualizada",
        tipo_interaccion: "texto",
        subtipo_respuesta: "codigo_corto",
        respuesta_correcta: "NUEVA-42",
        respuestas_aceptadas: ["nueva42", "clave42"]
      },
      {
        id: "opcion-editada",
        titulo: "Opción editada",
        reto: "Selecciona la opción recién configurada",
        pista: "La segunda opción es la válida",
        tipo_interaccion: "opcion_multiple",
        subtipo_respuesta: "palabra",
        opciones: ["Opción anterior", "Opción correcta editada", "Opción distractora"],
        respuesta_correcta: "Opción correcta editada",
        respuestas_aceptadas: ["Opción correcta editada"]
      },
      {
        id: "relacion-editada",
        titulo: "Relación editada",
        reto: "Relaciona las parejas actualizadas",
        pista: "Cada término tiene una definición",
        tipo_interaccion: "relacion_columnas",
        parejas: [
          { izquierda: "Concepto A editado", derecha: "Definición A editada" },
          { izquierda: "Concepto B editado", derecha: "Definición B editada" }
        ]
      },
      {
        id: "multimedia-editada",
        titulo: "Multimedia editada",
        reto: "Escucha y escribe el número actualizado",
        pista: "El audio menciona setenta y tres",
        tipo_interaccion: "multimedia",
        subtipo_respuesta: "numero",
        respuesta_correcta: "73",
        respuestas_aceptadas: ["73", "073"],
        media: { tipo: "audio", url: "assets/media/audio-editado.mp3", alt: "Audio actualizado" }
      }
    ]
  }]
};

const editedInteractivePkg = buildEscapeRoomPackage(editedInteractiveTypesProject);
const editedInteractiveJson = JSON.parse(editedInteractivePkg.files["assets/escape-room.json"]);
const editedInteractivePreview = buildPreviewDocument(editedInteractiveTypesProject, { editorialReview: true });
const [editedText, editedChoice, editedMatch, editedMedia] = editedInteractiveJson.misiones[0].preguntas;

assert.equal(editedText.respuesta_correcta, "NUEVA-42", "El ZIP debe conservar la respuesta correcta textual editada.");
assert.deepEqual(editedText.respuestas_aceptadas, ["nueva42", "clave42"], "El ZIP debe conservar los alias textuales editados.");
assert.deepEqual(editedChoice.opciones, ["Opción anterior", "Opción correcta editada", "Opción distractora"], "El ZIP debe conservar todas las opciones editadas.");
assert.equal(editedChoice.respuesta_correcta, "Opción correcta editada", "El ZIP debe conservar la opción correcta seleccionada.");
assert.deepEqual(editedChoice.respuestas_aceptadas, ["opcioncorrectaeditada"], "La opción correcta exportada debe quedar evaluable.");
assert.deepEqual(editedMatch.parejas.map(({ izquierda, derecha }) => ({ izquierda, derecha })), [
  { izquierda: "Concepto A editado", derecha: "Definición A editada" },
  { izquierda: "Concepto B editado", derecha: "Definición B editada" }
], "El ZIP debe conservar ambos lados editados de cada relación.");
assert.equal(editedMedia.media.url, "assets/media/audio-editado.mp3", "El ZIP debe conservar el recurso multimedia editado.");
assert.deepEqual(editedMedia.respuestas_aceptadas, ["73", "073"], "El ZIP debe conservar las variantes numéricas editadas para evaluarlas según el subtipo.");

for (const visibleEdit of [
  "Reto textual actualizado",
  "Pista textual actualizada",
  "Opción correcta editada",
  "Concepto A editado",
  "Definición B editada",
  "Escucha y escribe el número actualizado",
  "Audio actualizado"
]) {
  assert.match(editedInteractivePreview, new RegExp(visibleEdit), `El preview debe incluir el cambio: ${visibleEdit}`);
}

console.log("escapeRoom package builder OK.");
