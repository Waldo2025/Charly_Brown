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
assert.equal(englishFallbacks.misiones[0].titulo, "Room 1");
assert.equal(englishFallbacks.misiones[0].preguntas[0].titulo, "Question 1");
assert.match(englishFallbacks.misiones[0].historia, /room's story/i);
assert.match(englishFallbacks.misiones[0].contexto, /investigation/i);
const legacyBriefingFallback = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ historia: "This legacy story contains the facts needed to solve the room." }]
});
assert.equal(legacyBriefingFallback.misiones[0].contexto, legacyBriefingFallback.misiones[0].historia, "Los proyectos antiguos deben reutilizar su historia como expediente.");
const migratedDefaultBriefing = normalizeEscapeRoomProject({
  idioma: "fr-FR",
  misiones: [{ contexto: getGameMessages("es-419").defaultBriefingContext }]
});
assert.equal(migratedDefaultBriefing.misiones[0].contexto, getGameMessages("fr-FR").defaultBriefingContext, "Los expedientes automáticos antiguos deben adoptar el idioma elegido.");
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
const migratedEnglishHint = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ preguntas: [{ reto: "Find the correct option.", respuesta_correcta: "A", pista: "Lee con atención el enunciado y busca una pista concreta (número, acción, personaje, lugar o condición). No des la respuesta; identifica qué detalle permite descartar opciones incorrectas." }] }]
});
assert.match(migratedEnglishHint.misiones[0].preguntas[0].pista, /^Find the sentence in the briefing/);
assert.doesNotMatch(buildPreviewDocument(migratedEnglishHint), /Lee con atención/);
const migratedDetailedHint = normalizeEscapeRoomProject({
  idioma: "fr-FR",
  misiones: [{ preguntas: [{ reto: "Choisis.", respuesta_correcta: "A", pista: 'En el enunciado, usa el detalle "triangle" para descartar opciones que no cumplan esa condición.' }] }]
});
assert.match(migratedDetailedHint.misiones[0].preguntas[0].pista, /^Retrouve dans le dossier/);
assert.doesNotMatch(migratedDetailedHint.misiones[0].preguntas[0].pista, /triangle|Utilise le détail/i);
const customSpanishHintInEnglishProject = normalizeEscapeRoomProject({
  idioma: "en-US",
  misiones: [{ preguntas: [{ reto: "Choose.", respuesta_correcta: "A", pista: "Recuerda el experimento realizado ayer en clase." }] }]
});
assert.equal(customSpanishHintInEnglishProject.misiones[0].preguntas[0].pista, "Recuerda el experimento realizado ayer en clase.", "Una pista editorial personalizada no debe traducirse ni sobrescribirse automáticamente.");
const concreteDragHintStarts = {
  "es-419": "Empieza por",
  "en-US": "Start with",
  "fr-FR": "Commence par",
  "pt-BR": "Comece por"
};
for (const [locale, expectedStart] of Object.entries(concreteDragHintStarts)) {
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
  assert.ok(hint.startsWith(expectedStart), `${locale} debe construir una pista conceptual localizada.`);
  assert.match(hint, /bios/);
  assert.doesNotMatch(hint, /\bmatch\b|\beach\b/i);
  if (locale !== "es-419") assert.doesNotMatch(hint, /\sy\s/i);
  assert.ok(buildPreviewDocument(project).includes(hint), `${locale} debe conservar la pista reparada en preview/ZIP.`);
}
const mixedLanguageInstruction = "Reconnect the Earth family metaphors by linking images and natural elements with their appropriate kinship titles. Responde con una sola palabra.";
const localizedInstructionExpectations = {
  "en-US": "Answer with one word.",
  "en-GB": "Answer with one word.",
  "fr-FR": "Réponds avec un seul mot.",
  "pt-BR": "Responda com uma única palavra."
};
for (const [locale, expectedInstruction] of Object.entries(localizedInstructionExpectations)) {
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
  assert.ok(localizedChallenge.endsWith(expectedInstruction), `${locale} debe relocalizar la instrucción automática.`);
  assert.doesNotMatch(localizedChallenge, /Responde con una sola palabra/i);
  assert.doesNotMatch(buildPreviewDocument(localizedProject), /Responde con una sola palabra/i);
}
const originalLocaleProject = normalizeEscapeRoomProject({
  idioma: "es-419",
  misiones: [{ titulo: "Contenido", reto: "Identifica el concepto.", respuesta_correcta: "átomo" }]
});
const originalChallenge = originalLocaleProject.misiones[0].preguntas[0].reto;
const changedLocaleProject = normalizeEscapeRoomProject({ ...originalLocaleProject, idioma: "en-US" });
assert.notEqual(changedLocaleProject.misiones[0].preguntas[0].reto, originalChallenge, "Cambiar el locale debe relocalizar la instrucción automática.");
assert.match(changedLocaleProject.misiones[0].preguntas[0].reto, /Answer with one word\.$/);
assert.match(changedLocaleProject.misiones[0].preguntas[0].reto, /^Identifica el concepto\./, "El contenido pedagógico original debe conservarse.");

const creatorSource = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
assert.match(creatorSource, /idioma:\s*formData\.idioma\s*\|\|\s*"es-419"/);
assert.match(creatorSource, /elements\.idiomaSelect\?\.addEventListener\("change",\s*\(\)\s*=>/);
assert.match(creatorSource, /idioma:\s*elements\.idiomaSelect\?\.value\s*\|\|\s*"es-419"/);

console.log("Escape room i18n OK.");
