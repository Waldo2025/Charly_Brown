import assert from "node:assert/strict";

import {
  normalizeEscapeRoomProject,
  normalizeMission,
  normalizeMissionRelease,
  normalizeMissionTitle,
  normalizePresentationMode,
  isSingleWordAnswer,
  extractSingleWordAnswer,
  isOpenEndedTextPrompt,
  normalizeAcceptedAnswersForSubtype,
  resolveTextSubtypeForAnswer,
  getMissionAcceptedAnswers,
  replacePrimaryAcceptedAnswer,
  normalizePlayerAnswer,
  validateMissionAnswer,
  validateQuestionAnswer,
  normalizeMediaValue
} from "../public/js/escape-room-creator-model.mjs";

assert.equal(isSingleWordAnswer("comprensión"), true, "Una palabra real debe ser válida para el subtipo palabra.");
assert.equal(isSingleWordAnswer("pensamiento crítico"), false, "Una respuesta con espacios no debe pasar como palabra.");
assert.equal(
  isSingleWordAnswer("lacapacidaddecomprendercriticamenteexpresarideascoherentementeyargumentarconsolidez"),
  false,
  "Una frase pegada y excesivamente larga no debe pasar como palabra."
);
assert.equal(resolveTextSubtypeForAnswer("palabra", "pensamiento crítico"), "frase_corta", "El resolvedor genérico debe preservar compatibilidad fuera de preguntas abiertas.");
assert.equal(resolveTextSubtypeForAnswer("frase_corta", "pensamiento crítico"), "frase_corta", "El resolvedor genérico no debe alterar respuestas cerradas de otros tipos.");
assert.equal(extractSingleWordAnswer("la capacidad de comprender críticamente"), "capacidad", "Debe extraer una clave legible sin concatenar frases.");
assert.equal(isOpenEndedTextPrompt("Propón una regla y justifica su importancia"), true, "Debe detectar consignas de desarrollo libre.");
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
  "capacidad",
  "La normalización debe reducir una frase heredada a una palabra legible."
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
assert.equal(repairedOpenQuestion.respuesta_correcta, "Mantener", "Debe conservar una clave humana de una sola palabra.");
assert.deepEqual(repairedOpenQuestion.respuestas_aceptadas, ["mantener"], "No debe conservar la frase completa como variante válida.");
assert.match(repairedOpenQuestion.reto, /una sola palabra/i, "La consigna reparada debe explicar el formato de respuesta.");
assert.match(repairedOpenQuestion.reto, /ordena las letras/i, "Una consigna subjetiva heredada debe convertirse en un reto cerrado y verificable.");
assert.doesNotMatch(repairedOpenQuestion.reto, /\b(?:prop[oó]n|justifica)\b/i, "La consigna reparada ya no debe pedir producción libre.");

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
assert.equal(openMultimediaProject.misiones[0].preguntas[0].subtipo_respuesta, "palabra", "Una respuesta escrita sobre multimedia también debe limitarse a una palabra.");
assert.equal(openMultimediaProject.misiones[0].preguntas[0].respuesta_correcta, "Bosque", "La respuesta multimedia abierta debe usar una única clave.");

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
assert.match(legacyProject.instrucciones, /sala/i, "Un proyecto legacy debe recibir instrucciones seguras para salas.");
assert.equal(legacyProject.misiones[0].titulo, "Sala 1", "Debe conservar el titulo por defecto legacy.");
assert.equal(legacyProject.misiones[0].release, "SALA 01", "Debe conservar el release por defecto legacy.");
assert.match(legacyProject.misiones[0].historia, /sala/i, "Debe conservar el fallback narrativo legacy.");

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
assert.match(invalidModeProject.instrucciones, /sala/i, "Las instrucciones vacias deben usar el fallback del modo canonico.");
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
assert.equal(menuProject.misiones[0].titulo, "Actividad 01", "Debe adaptar un titulo estructural de sala a actividad.");
assert.equal(menuProject.misiones[0].release, "ACTIVIDAD 01", "Debe adaptar un release estructural de sala a actividad.");
assert.equal(menuProject.misiones[1].titulo, "Actividad 2", "Debe adaptar una seccion estructural a actividad.");
assert.equal(menuProject.misiones[1].release, "ACTIVIDAD 02", "Debe adaptar la etiqueta de seccion a actividad.");
assert.equal(menuProject.misiones[2].titulo, "Actividad 3", "Debe usar un titulo de actividad como fallback del menu.");
assert.equal(menuProject.misiones[2].release, "RETO LUNAR", "Debe preservar releases editoriales no genericos.");
assert.match(menuProject.misiones[2].historia, /actividad/i, "Debe usar narrativa de actividad en el fallback del menu.");

const menuFallbackContent = normalizeEscapeRoomProject({
  modo_presentacion: "menu_secciones",
  instrucciones: "",
  conclusion: ""
});
assert.match(menuFallbackContent.instrucciones, /actividad/i, "El fallback de instrucciones debe usar vocabulario del menu.");
assert.doesNotMatch(menuFallbackContent.conclusion, /sala/i, "El mensaje final por defecto no debe reintroducir vocabulario de salas.");

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

assert.equal(switchedBackToRooms.misiones[0].titulo, "Sala 01", "Volver a salas debe ajustar un titulo generico de actividad.");
assert.equal(switchedBackToRooms.misiones[0].release, "SALA 01", "Volver a salas debe ajustar un release generico de actividad.");
assert.equal(switchedBackToRooms.misiones[0].id, menuProject.misiones[0].id, "Cambiar el modo no debe regenerar IDs existentes.");
assert.deepEqual(switchedBackToRooms.misiones[0].preguntas, menuProject.misiones[0].preguntas, "Cambiar el modo no debe perder ni mutar preguntas.");
assert.deepEqual(switchedBackToRooms.misiones[0].media, menuProject.misiones[0].media, "Cambiar el modo no debe perder media.");
assert.equal(switchedBackToRooms.misiones[0].imagen, menuProject.misiones[0].imagen, "Cambiar el modo no debe perder imagenes.");

const directMenuMission = normalizeMission({}, 4, "menu_secciones");
assert.equal(directMenuMission.titulo, "Actividad 5", "normalizeMission debe aceptar el modo como tercer parametro.");
assert.equal(directMenuMission.release, "ACTIVIDAD 05", "normalizeMission debe aplicar releases dependientes del modo.");
assert.equal(normalizeMissionTitle("Mision 7", "", "menu_secciones"), "Actividad 7", "Debe exponer normalizacion de titulos dependiente del modo.");
assert.equal(normalizeMissionRelease("SALA 07", "", "menu_secciones"), "ACTIVIDAD 07", "Debe exponer normalizacion de releases dependiente del modo.");
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

console.log("escapeRoomCreator model OK.");
