import assert from "node:assert/strict";

import {
  normalizeEscapeRoomProject,
  normalizeMission,
  normalizeMissionRelease,
  normalizeMissionTitle,
  normalizePresentationMode,
  isSingleWordAnswer,
  normalizeAcceptedAnswersForSubtype,
  resolveTextSubtypeForAnswer,
  getMissionAcceptedAnswers,
  replacePrimaryAcceptedAnswer,
  normalizePlayerAnswer,
  validateMissionAnswer,
  validateQuestionAnswer,
  normalizeMediaValue,
  removeQuestionAtIndex,
  resolveOptionAnswerIndex,
  collectFullQuestionRepairTargets
} from "../public/js/escape-room-creator-model.mjs";

const removableQuestions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
const removedMiddleQuestion = removeQuestionAtIndex(removableQuestions, 1);
assert.deepEqual(removedMiddleQuestion.questions.map(({ id }) => id), ["q1", "q3"], "Debe eliminar únicamente la pregunta indicada.");
assert.equal(removedMiddleQuestion.removedQuestion?.id, "q2", "Debe informar cuál pregunta fue eliminada.");
assert.equal(removableQuestions.length, 3, "La operación base no debe mutar la lista original.");
assert.equal(removeQuestionAtIndex([{ id: "q1" }], 0).removedQuestion, null, "No debe eliminar la última pregunta de una sala.");

assert.equal(
  resolveOptionAnswerIndex(["Economic", "-ism", "Political"], "-ism", ["Economic"], 0),
  1,
  "La respuesta corregida debe tener prioridad sobre respuestas aceptadas e índices obsoletos."
);
assert.equal(
  resolveOptionAnswerIndex(["Economic", "-ism", "Political"], "ism", [], -1),
  1,
  "La comparación debe reconocer una opción con guion sin alterar su texto visible."
);

assert.deepEqual(
  collectFullQuestionRepairTargets([
    { roomIndex: 2, questionIndex: 3, field: "reto", code: "repeated_question" },
    { roomIndex: 2, questionIndex: 3, field: "respuesta_correcta", code: "repeated_answer" },
    { roomIndex: 2, questionIndex: 1, field: "pista", code: "unrelated_hint" },
    { roomIndex: 1, questionIndex: null, field: "contexto", code: "briefing_too_short" }
  ]),
  [{ roomIndex: 2, questionIndex: 3 }],
  "Una repetición debe regenerar una sola vez la pregunta completa, sin convertir pistas o briefings en regeneraciones totales."
);

assert.deepEqual(
  normalizeAcceptedAnswersForSubtype(["Orion", "orion", "ORION"], "palabra"),
  ["orion"],
  "Las respuestas aceptadas equivalentes deben normalizarse sin duplicados."
);

assert.equal(isSingleWordAnswer("comprensión"), true, "Una palabra real debe ser válida para el subtipo palabra.");
assert.equal(isSingleWordAnswer("mother-in-law"), true, "Una palabra compuesta con guiones debe ser válida.");
assert.equal(isSingleWordAnswer("l’été"), true, "Una palabra Unicode con apóstrofo tipográfico debe ser válida.");
assert.equal(isSingleWordAnswer("pensamiento crítico"), true, "Dos palabras sin números deben ser válidas para el subtipo palabra.");
assert.equal(isSingleWordAnswer("word 2"), false, "Una frase que mezcla palabras y números no debe pasar como palabra.");
assert.equal(
  isSingleWordAnswer("lacapacidaddecomprendercriticamenteexpresarideascoherentementeyargumentarconsolidez"),
  false,
  "Una frase pegada y excesivamente larga no debe pasar como palabra."
);
assert.equal(resolveTextSubtypeForAnswer("palabra", "pensamiento crítico"), "palabra", "El resolvedor debe conservar hasta dos palabras sin números.");
assert.equal(resolveTextSubtypeForAnswer("frase_corta", "pensamiento crítico"), "frase_corta", "El resolvedor genérico no debe alterar respuestas cerradas de otros tipos.");
const twoWordChallenge = "Match each Greek root with its exact meaning.";
const duplicatedChallenge = `${twoWordChallenge} Answer using words only, without numbers. Answer using words only, without numbers.`;
const duplicatedMissionChallenge = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{
    reto: duplicatedChallenge,
    preguntas: [{ reto: "Choose the correct pair.", tipo_interaccion: "opcion_multiple", opciones: ["A", "B"] }]
  }]
}).misiones[0].reto;
assert.equal(
  duplicatedMissionChallenge,
  duplicatedChallenge,
  "El normalizador no debe redactar ni deduplicar el Challenge; la corrección editorial pertenece a Gemini."
);
const editorialInput = {
  idioma: "en-US",
  titulo: "The Marble Archive",
  instrucciones: "Read the briefing, then solve the questions.",
  clave_final: "MUSE",
  misiones: [{
    id: "room-1",
    release: "ROOM 01",
    titulo: "The Doric Gate",
    historia: "An archivist opens the marble chamber.",
    contexto: "The Doric order is identified by its plain capital.",
    reto: "Restore the archive seal.",
    pista: "Compare the capital with the description in the briefing.",
    retroalimentacion_correcta: "The seal aligns.",
    retroalimentacion_incorrecta: "The capital does not match.",
    preguntas: [{
      id: "q1",
      release: "Q01",
      titulo: "Identify the order",
      reto: "Which order uses a plain capital?",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "Doric",
      respuestas_aceptadas: ["Doric"],
      pista: "Look for the description of the capital.",
      retroalimentacion_correcta: "The Doric record opens.",
      retroalimentacion_incorrecta: "Review the capital description."
    }]
  }],
  conclusion: "The archive is restored."
};
const normalizedEditorialOnce = normalizeEscapeRoomProject(editorialInput);
const normalizedEditorialThrice = Array.from({ length: 2 }).reduce(
  (projectValue) => normalizeEscapeRoomProject(projectValue),
  normalizedEditorialOnce
);
for (const field of ["titulo", "instrucciones", "conclusion"]) {
  assert.equal(normalizedEditorialThrice[field], normalizedEditorialOnce[field], `La normalización repetida debe conservar ${field}.`);
}
for (const field of ["release", "titulo", "historia", "contexto", "reto", "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta"]) {
  assert.equal(normalizedEditorialThrice.misiones[0][field], normalizedEditorialOnce.misiones[0][field], `La normalización repetida debe conservar misión.${field}.`);
}
for (const field of ["release", "titulo", "reto", "respuesta_correcta", "pista", "retroalimentacion_correcta", "retroalimentacion_incorrecta"]) {
  assert.equal(normalizedEditorialThrice.misiones[0].preguntas[0][field], normalizedEditorialOnce.misiones[0].preguntas[0][field], `La normalización repetida debe conservar pregunta.${field}.`);
}
assert.equal(Object.hasOwn(normalizedEditorialThrice.misiones[0].preguntas[0], "_coverage_anchor"), false, "El normalizador no debe reintroducir el anchor temporal después de eliminarlo.");
assert.deepEqual(
  normalizeAcceptedAnswersForSubtype(["comprensión", "capacidad de comprender"], "palabra"),
  ["comprension"],
  "Las variantes de palabra deben descartar frases completas."
);

const malformedWordProject = normalizeEscapeRoomProject({
  misiones: [{
    preguntas: [{
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "la capacidad de comprender críticamente",
      respuestas_aceptadas: ["la capacidad de comprender críticamente"]
    }]
  }]
});
assert.equal(malformedWordProject.misiones[0].preguntas[0].subtipo_respuesta, "palabra", "Una pregunta abierta debe conservar un contrato de una palabra.");
assert.equal(
  malformedWordProject.misiones[0].preguntas[0].respuesta_correcta,
  "la capacidad de comprender críticamente",
  "La normalización no debe ocultar una respuesta inválida extrayendo una palabra distinta."
);

const openEndedProject = normalizeEscapeRoomProject({
  misiones: [{
    preguntas: [{
      titulo: "Elaborando una Normativa Justificada",
      reto: "Propón una regla escolar breve para la biblioteca y justifica su importancia en no más de 20 palabras.",
      tipo_interaccion: "texto",
      subtipo_respuesta: "frase_corta",
      respuesta_correcta: "Mantener silencio absoluto. Esto asegura un ambiente adecuado.",
      respuestas_aceptadas: ["Mantener silencio absoluto. Esto asegura un ambiente adecuado."]
    }]
  }]
});
const repairedOpenQuestion = openEndedProject.misiones[0].preguntas[0];
assert.equal(repairedOpenQuestion.subtipo_respuesta, "palabra", "Una respuesta abierta legacy debe migrar al subtipo palabra.");
assert.equal(repairedOpenQuestion.respuesta_correcta, "Mantener silencio absoluto. Esto asegura un ambiente adecuado.", "La respuesta inválida debe conservarse para que la auditoría pueda detectarla.");
assert.deepEqual(repairedOpenQuestion.respuestas_aceptadas, [], "Una frase no debe convertirse silenciosamente en variante de palabra.");
assert.equal(
  repairedOpenQuestion.reto,
  "Propón una regla escolar breve para la biblioteca y justifica su importancia en no más de 20 palabras.",
  "La auditoría de Gemini, no el normalizador, debe decidir cómo corregir una consigna incompatible."
);

const numericWordProject = normalizeEscapeRoomProject({
  misiones: [{ preguntas: [{ tipo_interaccion: "texto", subtipo_respuesta: "palabra", respuesta_correcta: "42", _coverage_anchor: "temporary evidence" }] }]
});
assert.equal(numericWordProject.misiones[0].preguntas[0].subtipo_respuesta, "numero", "Una respuesta completamente numérica debe reclasificarse como número.");
assert.equal(numericWordProject.misiones[0].preguntas[0]._coverage_anchor, "temporary evidence", "El anchor debe sobrevivir hasta que el flujo lo elimine explícitamente después de la auditoría.");

const openMultimediaProject = normalizeEscapeRoomProject({
  misiones: [{ preguntas: [{
    titulo: "Observa y responde",
    reto: "Describe la escena de la imagen con una frase.",
    tipo_interaccion: "multimedia",
    subtipo_respuesta: "frase_corta",
    respuesta_correcta: "Bosque tranquilo",
    media: { tipo: "imagen", url: "assets/bosque.webp", alt: "Un bosque" }
  }]}]
});
assert.equal(openMultimediaProject.misiones[0].preguntas[0].subtipo_respuesta, "palabra", "Una respuesta multimedia puede contener hasta dos palabras sin números.");
assert.equal(openMultimediaProject.misiones[0].preguntas[0].respuesta_correcta, "Bosque tranquilo", "La respuesta multimedia válida debe conservarse completa.");
assert.deepEqual(openMultimediaProject.misiones[0].preguntas[0].respuestas_aceptadas, ["bosquetranquilo"], "Las dos palabras deben normalizarse como una respuesta exacta sin inventar otra clave.");

const freeResponseProject = normalizeEscapeRoomProject({
  misiones: [{ preguntas: [{
    titulo: "Reflexión personal",
    reto: "Explica con tus palabras cómo cuidarías la biblioteca.",
    tipo_interaccion: "texto",
    subtipo_respuesta: "frase_libre",
    respuesta_correcta: "",
    respuestas_aceptadas: []
  }]}]
});
const freeResponseQuestion = freeResponseProject.misiones[0].preguntas[0];
assert.equal(freeResponseQuestion.subtipo_respuesta, "frase_libre", "Debe conservar el modo explícito de frase libre.");
assert.match(freeResponseQuestion.reto, /explica con tus palabras/i, "Una frase libre no debe convertirse en anagrama.");
assert.equal(validateQuestionAnswer(freeResponseQuestion, ""), false, "Una frase libre vacía no debe avanzar.");
assert.equal(validateQuestionAnswer(freeResponseQuestion, "Cuidaría los libros y respetaría el silencio."), true, "Cualquier frase libre no vacía debe ser correcta.");

const legacyProject = normalizeEscapeRoomProject({
  titulo: "Proyecto anterior",
  misiones: [{}]
});

assert.equal(legacyProject.modo_presentacion, "salas", "Un proyecto legacy debe usar el modo salas.");
assert.equal(legacyProject.instrucciones, "", "El normalizador no debe inventar instrucciones para un proyecto legacy.");
assert.equal(legacyProject.misiones[0].titulo, "", "El normalizador no debe inventar títulos editoriales.");
assert.equal(legacyProject.misiones[0].release, "", "El normalizador no debe inventar releases editoriales.");
assert.equal(legacyProject.misiones[0].historia, "", "El normalizador no debe inventar narrativa.");

const academicPaletteProject = normalizeEscapeRoomProject({
  misiones: [{
    paleta_academica: {
      color_estacion: "#E95297",
      color_tema_unidad: "#2DA6B1",
      estacion_index: 3,
      tema_unidad_index: 1
    }
  }]
});
assert.deepEqual(
  academicPaletteProject.misiones[0].paleta_academica,
  { color_estacion: "#e95297", color_tema_unidad: "#2da6b1", estacion_index: 3, tema_unidad_index: 1 },
  "Cada sala debe conservar por separado los colores de estación y tema/unidad."
);

const invalidModeProject = normalizeEscapeRoomProject({
  modo_presentacion: "tablero_desconocido",
  instrucciones: "   ",
  misiones: [{}]
});

assert.equal(invalidModeProject.modo_presentacion, "salas", "Un modo desconocido debe degradar a salas.");
assert.equal(invalidModeProject.instrucciones, "", "Las instrucciones vacías deben permanecer vacías para que Gemini o el editor las corrijan.");
assert.equal(normalizePresentationMode(" MENU_SECCIONES "), "menu_secciones", "Debe canonizar el modo menu.");
assert.equal(normalizePresentationMode("otro"), "salas", "El normalizador publico debe degradar modos invalidos.");

const menuProject = normalizeEscapeRoomProject({
  modo_presentacion: "menu_secciones",
  instrucciones: "  Completa cada acertijo y vuelve al menu.  ",
  backgroundImage: "data:image/png;base64,PORTADA",
  misiones: [
    {
      id: "actividad-estable",
      titulo: "Sala 01",
      release: "SALA 01",
      imagen: "data:image/png;base64,ACTIVIDAD",
      media: {
        tipo: "imagen",
        url: "assets/media/mapa.webp",
        alt: "Mapa del reto"
      },
      preguntas: [
        {
          id: "pregunta-estable",
          titulo: "Pregunta visual",
          reto: "Selecciona el simbolo correcto.",
          respuesta_correcta: "Delta",
          respuestas_aceptadas: ["delta", "triangulo"],
          opciones: ["Delta", "Omega", "Sigma"],
          imagen: "data:image/png;base64,PREGUNTA",
          media: {
            tipo: "audio",
            url: "assets/media/pista.mp3",
            alt: "Pista sonora"
          }
        }
      ]
    },
    {
      titulo: "Seccion 2",
      etiqueta: "SECCION 02",
      preguntas: [{ respuesta_correcta: "2" }]
    },
    {
      release: "RETO LUNAR",
      preguntas: [{ respuesta_correcta: "luna" }]
    }
  ]
});

assert.equal(menuProject.modo_presentacion, "menu_secciones", "Debe preservar el modo menu canonico.");
assert.equal(menuProject.instrucciones, "Completa cada acertijo y vuelve al menu.", "Debe preservar y recortar instrucciones editadas.");
assert.equal(menuProject.misiones.length, 3, "El menu debe mantener misiones como arbol comun.");
assert.equal(menuProject.misiones[0].titulo, "Sala 01", "El modo de presentación no debe reescribir un título recibido.");
assert.equal(menuProject.misiones[0].release, "SALA 01", "El modo de presentación no debe reescribir un release recibido.");
assert.equal(menuProject.misiones[1].titulo, "Seccion 2", "Debe preservar el título recibido sin traducción local.");
assert.equal(menuProject.misiones[1].release, "SECCION 02", "Debe preservar la etiqueta recibida sin traducción local.");
assert.equal(menuProject.misiones[2].titulo, "", "Debe dejar vacío un título ausente.");
assert.equal(menuProject.misiones[2].release, "RETO LUNAR", "Debe preservar releases editoriales no genericos.");
assert.equal(menuProject.misiones[2].historia, "", "Debe dejar vacía una narrativa ausente.");

const menuFallbackContent = normalizeEscapeRoomProject({
  modo_presentacion: "menu_secciones",
  instrucciones: "",
  conclusion: ""
});
assert.equal(menuFallbackContent.instrucciones, "", "No debe existir fallback editorial de instrucciones.");
assert.equal(menuFallbackContent.conclusion, "", "No debe existir fallback editorial de conclusión.");

assert.equal(menuProject.backgroundImage, "data:image/png;base64,PORTADA", "Debe preservar el asset de portada.");
assert.equal(menuProject.misiones[0].id, "actividad-estable", "Debe preservar IDs de misiones al cambiar la presentacion.");
assert.equal(menuProject.misiones[0].imagen, "data:image/png;base64,ACTIVIDAD", "Debe preservar la imagen de actividad.");
assert.equal(menuProject.misiones[0].media.url, "assets/media/mapa.webp", "Debe preservar media de actividad.");
assert.equal(menuProject.misiones[0].preguntas[0].id, "pregunta-estable", "Debe preservar IDs de preguntas.");
assert.equal(menuProject.misiones[0].preguntas[0].imagen, "data:image/png;base64,PREGUNTA", "Debe preservar assets de preguntas.");
assert.equal(menuProject.misiones[0].preguntas[0].media.url, "assets/media/pista.mp3", "Debe preservar media de preguntas.");
assert.deepEqual(menuProject.misiones[0].preguntas[0].opciones, ["Delta", "Omega", "Sigma"], "Debe preservar opciones de preguntas.");
assert.deepEqual(menuProject.misiones[0].preguntas[0].respuestas_aceptadas, ["delta", "triangulo"], "Debe preservar respuestas aceptadas.");

const switchedBackToRooms = normalizeEscapeRoomProject({
  ...menuProject,
  modo_presentacion: "salas"
});

assert.equal(switchedBackToRooms.misiones[0].titulo, menuProject.misiones[0].titulo, "Cambiar de modo debe conservar el título literal.");
assert.equal(switchedBackToRooms.misiones[0].release, menuProject.misiones[0].release, "Cambiar de modo debe conservar el release literal.");
assert.equal(switchedBackToRooms.misiones[0].id, menuProject.misiones[0].id, "Cambiar el modo no debe regenerar IDs existentes.");
assert.deepEqual(switchedBackToRooms.misiones[0].preguntas, menuProject.misiones[0].preguntas, "Cambiar el modo no debe perder ni mutar preguntas.");
assert.deepEqual(switchedBackToRooms.misiones[0].media, menuProject.misiones[0].media, "Cambiar el modo no debe perder media.");
assert.equal(switchedBackToRooms.misiones[0].imagen, menuProject.misiones[0].imagen, "Cambiar el modo no debe perder imagenes.");

const directMenuMission = normalizeMission({}, 4, "menu_secciones");
assert.equal(directMenuMission.titulo, "", "normalizeMission no debe inventar un título dependiente del modo.");
assert.equal(directMenuMission.release, "", "normalizeMission no debe inventar un release dependiente del modo.");
assert.equal(normalizeMissionTitle("Mision 7", "", "menu_secciones"), "Mision 7", "Debe preservar títulos literalmente.");
assert.equal(normalizeMissionRelease("SALA 07", "", "menu_secciones"), "SALA 07", "Debe preservar releases literalmente.");
assert.equal(normalizeMissionTitle("Sala de los enigmas", "", "menu_secciones"), "Sala de los enigmas", "Cambiar de modo no debe reescribir titulos editoriales.");
assert.equal(normalizeMissionRelease("SALA OCULTA", "", "menu_secciones"), "SALA OCULTA", "Cambiar de modo no debe reescribir releases editoriales.");

const project = normalizeEscapeRoomProject({
  titulo: "Boveda Algebraica",
  misiones: [
    {
      id: "m1",
      titulo: "Codigo uno",
      tipo_interaccion: "texto",
      subtipo_respuesta: "letra",
      respuesta_correcta: "B",
      respuestas_aceptadas: ["b", " beta "],
      preguntas: [
        {
          id: "q1",
          titulo: "Pregunta interna",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          respuesta_correcta: "llave",
          respuestas_aceptadas: ["llave"]
        }
      ],
      desbloquea: ["m2"]
    },
    {
      id: "m2",
      titulo: "Clave numerica",
      tipo_interaccion: "multimedia",
      subtipo_respuesta: "numero",
      respuesta_correcta: "42",
      media: {
        tipo: "audio",
        url: "assets/media/pista.mp3"
      }
    },
    {
      id: "m3",
      titulo: "Emparejar",
      tipo_interaccion: "relacion_columnas",
      parejas: [
        { izquierda: "x", derecha: "2" },
        { izquierda: "y", derecha: "7" }
      ],
      bloqueada_inicial: true
    }
  ]
});

assert.equal(project.misiones.length, 3, "Debe conservar las misiones normalizadas.");
assert.equal(project.misiones[0].subtipo_respuesta, "letra", "Debe preservar el subtipo de respuesta.");
assert.equal(project.misiones[1].media.tipo, "audio", "Debe normalizar el media de una misión multimedia.");
assert.deepEqual(project.misiones[0].desbloquea, ["m2"], "Debe preservar la regla simple de desbloqueo.");
assert.equal(project.misiones[2].bloqueada_inicial, true, "Debe preservar el estado inicial bloqueado.");

assert.ok(Array.isArray(project.misiones[0].preguntas), "Debe normalizar una lista de preguntas internas por sala.");
assert.equal(project.misiones[0].preguntas.length, 1, "Debe conservar la pregunta interna declarada.");
assert.equal(project.misiones[0].preguntas[0].respuesta_correcta, "llave", "Debe normalizar la respuesta correcta de la pregunta interna.");

assert.equal(
  validateQuestionAnswer(project.misiones[0].preguntas[0], "LLAVE"),
  true,
  "Debe validar respuestas correctas en preguntas internas."
);

assert.deepEqual(
  getMissionAcceptedAnswers(project.misiones[0]),
  ["b"],
  "Debe priorizar respuestas_aceptadas y normalizarlas con el subtipo para validar."
);

assert.equal(
  normalizePlayerAnswer(" Á-2 ", { subtipo_respuesta: "codigo_corto" }),
  "a2",
  "Debe normalizar codigos cortos sin acentos ni separadores."
);

assert.equal(
  normalizePlayerAnswer(" 0042 ", { subtipo_respuesta: "numero" }),
  "42",
  "Debe normalizar respuestas numericas removiendo ceros de relleno."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "B"),
  true,
  "Debe aceptar la respuesta correcta aunque exista una lista de variantes."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "beta"),
  true,
  "Debe aceptar variantes definidas en respuestas_aceptadas."
);

assert.equal(
  validateMissionAnswer(project.misiones[1], "0042"),
  true,
  "Debe validar numeros equivalentes en misiones multimedia."
);

assert.equal(
  validateQuestionAnswer({ subtipo_respuesta: "numero", respuesta_correcta: "0042", respuestas_aceptadas: ["0042"] }, "42"),
  true,
  "Debe normalizar de la misma forma la respuesta numérica guardada y la ingresada."
);

assert.equal(
  validateQuestionAnswer({ subtipo_respuesta: "letra", respuesta_correcta: "Beta", respuestas_aceptadas: ["Beta"] }, "B"),
  true,
  "Debe normalizar de la misma forma las respuestas correctas de subtipo letra."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "ZZ"),
  false,
  "Debe rechazar respuestas incorrectas."
);

assert.deepEqual(
  replacePrimaryAcceptedAnswer(["arbol", "vegetal"], "Árbol", "Bosque"),
  ["bosque", "vegetal"],
  "Cambiar la respuesta correcta debe retirar la anterior aunque cambien acentos o mayúsculas."
);

assert.deepEqual(
  replacePrimaryAcceptedAnswer(["clave-42", "alternativa", "NUEVA 7"], "Clave 42", "Nueva-7"),
  ["nueva7", "alternativa"],
  "La sustitución debe evitar duplicados normalizados y conservar solamente alias independientes."
);

const descriptiveMedia = normalizeMediaValue("Terminal de computadora antigua con pantalla de fósforo verde mostrando expresiones algebraicas.");
assert.equal(descriptiveMedia?.url || "", "", "No debe tratar una descripcion larga como URL de media.");
assert.match(descriptiveMedia?.texto || "", /Terminal de computadora antigua/i, "Debe preservar la descripcion como texto de apoyo.");

const themedProject = normalizeEscapeRoomProject({
  themeConfig: { presetId: "cosmos", baseColor: "#0ea5e9", cardRadius: 18, titleColor: "#ffffff" }
});
assert.deepEqual(
  themedProject.themeConfig,
  { presetId: "cosmos", baseColor: "#0ea5e9", cardRadius: 18, titleColor: "#ffffff" },
  "themeConfig debe sobrevivir la normalización para que un ZIP se pueda reabrir sin perder su apariencia."
);

const dragDropProject = normalizeEscapeRoomProject({
  misiones: [{ preguntas: [{
    tipo_interaccion: "drag_drop",
    parejas: [
      { izquierda: "Destino A", derecha: "Ficha A" },
      { izquierda: "Destino B", derecha: "Ficha B" }
    ]
  }] }]
});
assert.equal(dragDropProject.misiones[0].preguntas[0].tipo_interaccion, "drag_drop", "Debe preservar el nuevo tipo drag_drop.");
assert.deepEqual(
  dragDropProject.misiones[0].preguntas[0].parejas.map(({ izquierda, derecha }) => ({ izquierda, derecha })),
  [
    { izquierda: "Destino A", derecha: "Ficha A" },
    { izquierda: "Destino B", derecha: "Ficha B" }
  ],
  "Drag & drop debe reutilizar el contrato normalizado de parejas."
);

console.log("escapeRoomCreator model OK.");
