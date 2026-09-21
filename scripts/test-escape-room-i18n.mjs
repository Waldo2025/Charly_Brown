import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SUPPORTED_GAME_LOCALES,
  getGameMessageKeys,
  getGameMessages,
  normalizeGameLocale
} from "../public/js/escape-room-game-i18n.mjs";
import { normalizeEscapeRoomProject } from "../public/js/escape-room-creator-model.mjs";
import {
  buildEscapeRoomPackage,
  buildGameHtml,
  buildGameRuntime,
  buildPreviewDocument
} from "../public/js/escape-room-package-builder.mjs";

const expectedKeys = getGameMessageKeys();
for (const locale of SUPPORTED_GAME_LOCALES) {
  assert.deepEqual(Object.keys(getGameMessages(locale)).sort(), expectedKeys, `${locale} debe conservar todas las claves i18n.`);
}
assert.equal(normalizeGameLocale("EN-us"), "en-US");
assert.equal(normalizeGameLocale("desconocido"), "es-419");
assert.equal(normalizeEscapeRoomProject({}).idioma, "es-419");

const localeMarkers = {
  "es-419": ["Iniciar escape room", "Pantalla completa"],
  "es-ES": ["Iniciar escape room", "Pantalla completa"],
  "en-US": ["Start escape room", "Full screen"],
  "en-GB": ["Start escape room", "Full screen"],
  "fr-FR": ["Démarrer l&#39;escape game", "Plein écran"],
  "pt-BR": ["Iniciar escape room", "Tela cheia"]
};

for (const locale of SUPPORTED_GAME_LOCALES) {
  for (const mode of ["salas", "menu_secciones"]) {
    const project = {
      idioma: locale,
      modo_presentacion: mode,
      titulo: "PROJECT TITLE",
      subtitulo: "PROJECT SUBTITLE",
      introduccion: "PROJECT INTRODUCTION",
      instrucciones: "PROJECT INSTRUCTIONS",
      conclusion: locale === "fr-FR" ? "Le code final est AZ42" : locale === "pt-BR" ? "O código final é AZ42" : "Final code is AZ42",
      misiones: [{
        titulo: "MISSION TITLE",
        historia: "MISSION STORY",
        reto: "MISSION CHALLENGE",
        respuesta_correcta: "OK",
        pista: "MISSION HINT",
        preguntas: [{ titulo: "QUESTION TITLE", reto: "QUESTION PROMPT", respuesta_correcta: "A", pista: "QUESTION HINT" }]
      }]
    };
    const normalized = normalizeEscapeRoomProject(project);
    assert.equal(normalized.idioma, locale);

    const html = buildGameHtml(project);
    const preview = buildPreviewDocument(project);
    const runtime = buildGameRuntime(project);
    const packageResult = buildEscapeRoomPackage(project);
    const manifest = JSON.parse(packageResult.files["assets/escape-room.json"]);

    assert.match(html, new RegExp(`<html lang="${locale}"`));
    assert.match(preview, new RegExp(`<html lang="${locale}"`));
    assert.equal(manifest.idioma, locale);
    assert.equal(JSON.parse(runtime.match(/const ESCAPE_ROOM_DATA = ([\s\S]*?);\nconst ESCAPE_ROOM_I18N/)[1]).idioma, locale);
    for (const marker of localeMarkers[locale]) assert.ok(html.includes(marker), `${locale}/${mode} debe mostrar «${marker}».`);
    assert.ok(runtime.includes('const ESCAPE_ROOM_I18N = '));
    assert.ok(runtime.includes('const ESCAPE_ROOM_FINAL_PASSCODE = "AZ42"'));
  }
}

const englishFallbacks = normalizeEscapeRoomProject({ idioma: "en-US", misiones: [{}] });
assert.equal(englishFallbacks.misiones[0].titulo, "");
assert.equal(englishFallbacks.misiones[0].preguntas[0].titulo, "");
assert.equal(englishFallbacks.misiones[0].historia, "");
assert.equal(englishFallbacks.misiones[0].contexto, "");
const legacyBriefingFallback = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ historia: "This legacy story contains the facts needed to solve the room." }]
});
assert.equal(legacyBriefingFallback.misiones[0].contexto, legacyBriefingFallback.misiones[0].historia, "Los proyectos antiguos deben reutilizar su historia como expediente.");
const migratedDefaultBriefing = normalizeEscapeRoomProject({
  idioma: "fr-FR",
  misiones: [{ contexto: getGameMessages("es-419").defaultBriefingContext }]
});
assert.equal(migratedDefaultBriefing.misiones[0].contexto, getGameMessages("es-419").defaultBriefingContext, "El normalizador no debe traducir ni sustituir expedientes editoriales.");
const localizedBriefingLabels = {
  "es-419": "He leído el expediente · Comenzar",
  "en-US": "I’ve read the briefing · Start",
  "fr-FR": "J’ai lu le dossier · Commencer",
  "pt-BR": "Li o dossiê · Começar"
};
for (const [locale, label] of Object.entries(localizedBriefingLabels)) {
  const preview = buildPreviewDocument({
    idioma: locale,
    misiones: [{ id: "briefing", historia: "Story", contexto: "Context", datos_clave: ["Evidence"], preguntas: [{ respuesta_correcta: "A" }] }]
  });
  assert.ok(preview.includes(label), `${locale} debe localizar el botón del expediente.`);
}
const customBriefingPreview = buildPreviewDocument({
  idioma: "en-US",
  misiones: [{
    id: "custom-briefing",
    historia: "Story",
    contexto: "Context",
    datos_clave: ["Evidence"],
    briefing_titulo: "Case file",
    briefing_instruccion: "Read this custom dossier first.",
    briefing_evidencias_titulo: "Verified clues",
    briefing_objetivo_titulo: "Current objective",
    briefing_boton_inicio: "Dossier reviewed · Begin",
    briefing_boton_revisar: "Open the dossier again",
    briefing_mensaje_listo: "The dossier is ready.",
    preguntas: [{ respuesta_correcta: "A" }]
  }]
});
for (const expected of ["Case file", "Read this custom dossier first.", "Verified clues", "Current objective", "Dossier reviewed · Begin", "Open the dossier again", "The dossier is ready."]) {
  assert.ok(customBriefingPreview.includes(expected), `El preview debe usar el texto editorial «${expected}».`);
}
const migratedEnglishHint = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ preguntas: [{ reto: "Find the correct option.", respuesta_correcta: "A", pista: "Lee con atención el enunciado y busca una pista concreta (número, acción, personaje, lugar o condición). No des la respuesta; identifica qué detalle permite descartar opciones incorrectas." }] }]
});
assert.match(migratedEnglishHint.misiones[0].preguntas[0].pista, /^Lee con atención/);
assert.match(buildPreviewDocument(migratedEnglishHint), /Lee con atención/);
const migratedDetailedHint = normalizeEscapeRoomProject({
  idioma: "fr-FR",
  misiones: [{ preguntas: [{ reto: "Choisis.", respuesta_correcta: "A", pista: 'En el enunciado, usa el detalle "triangle" para descartar opciones que no cumplan esa condición.' }] }]
});
assert.equal(migratedDetailedHint.misiones[0].preguntas[0].pista, 'En el enunciado, usa el detalle "triangle" para descartar opciones que no cumplan esa condición.');
const customSpanishHintInEnglishProject = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ preguntas: [{ reto: "Choose.", respuesta_correcta: "A", pista: "Recuerda el experimento realizado ayer en clase." }] }]
});
assert.equal(customSpanishHintInEnglishProject.misiones[0].preguntas[0].pista, "Recuerda el experimento realizado ayer en clase.", "Una pista editorial personalizada no debe traducirse ni sobrescribirse automáticamente.");
for (const locale of ["es-419", "en-US", "fr-FR", "pt-BR"]) {
  const project = normalizeEscapeRoomProject({
    idioma: locale,
    misiones: [{ preguntas: [{
      titulo: "Greek roots",
      reto: "Match each root with its meaning.",
      tipo_interaccion: "drag_drop",
      parejas: [
        { izquierda: "bios", derecha: "life" },
        { izquierda: "geos", derecha: "Earth" },
        { izquierda: "physis", derecha: "nature" }
      ],
      pista: 'Use the detail "match" y "each" in the prompt to rule out options.'
    }] }]
  });
  const hint = project.misiones[0].preguntas[0].pista;
  assert.equal(hint, 'Use the detail "match" y "each" in the prompt to rule out options.', `${locale} debe conservar literalmente la pista para que la auditoría de Gemini decida si requiere corrección.`);
  assert.match(buildPreviewDocument(project), /Use the detail/, `${locale} debe conservar la pista editorial en preview/ZIP.`);
}
const mixedLanguageInstruction = "Reconnect the Earth family metaphors by linking images and natural elements with their appropriate kinship titles. Responde con una sola palabra.";
for (const locale of ["en-US", "en-GB", "fr-FR", "pt-BR"]) {
  const localizedProject = normalizeEscapeRoomProject({
    idioma: locale,
    misiones: [{ preguntas: [{
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      reto: mixedLanguageInstruction,
      respuesta_correcta: "Earth"
    }] }]
  });
  const localizedChallenge = localizedProject.misiones[0].preguntas[0].reto;
  assert.equal(localizedChallenge, mixedLanguageInstruction, `${locale} no debe provocar una reescritura local del reto.`);
  assert.match(buildPreviewDocument(localizedProject), /Responde con una sola palabra/i);
}
const originalLocaleProject = normalizeEscapeRoomProject({
  idioma: "es-419",
  misiones: [{ titulo: "Contenido", reto: "Identifica el concepto.", respuesta_correcta: "átomo" }]
});
const originalChallenge = originalLocaleProject.misiones[0].preguntas[0].reto;
const changedLocaleProject = normalizeEscapeRoomProject({ ...originalLocaleProject, idioma: "en-US" });
assert.equal(changedLocaleProject.misiones[0].preguntas[0].reto, originalChallenge, "Cambiar el locale no debe reescribir el contenido pedagógico.");

const creatorSource = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
assert.match(creatorSource, /idioma:\s*formData\.idioma\s*\|\|\s*"es-419"/);
assert.match(creatorSource, /elements\.idiomaSelect\?\.addEventListener\("change",\s*\(\)\s*=>/);
assert.match(creatorSource, /idioma:\s*elements\.idiomaSelect\?\.value\s*\|\|\s*"es-419"/);

console.log("Escape room i18n OK.");
