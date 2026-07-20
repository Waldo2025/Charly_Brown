import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/PigPenCreator.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const firestoreRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");

assert.match(html, /id="btnAddTopic"[\s\S]*data-er-tooltip="Crear tema"/, "El Brief debe ofrecer el botón para crear temas.");
assert.match(html, /data-er-inspector-tab="topics"[\s\S]*id="erTopicList"/, "El inspector debe incluir el panel Temas.");
assert.match(html, /<input type="number" id="erNewTopicNumber" min="1" step="1"/, "El diálogo debe aceptar enteros positivos sin máximo fijo.");

assert.match(js, /const TOPICS_SUBCOLLECTION = "topics";/, "PigPen debe usar la subcolección topics.");
assert.match(js, /async function migrateLegacySessionTopic\([\s\S]*createTopicDocument/, "Las sesiones legacy deben migrarse al primer tema.");
assert.match(js, /function buildInheritedTopicFormState\([\s\S]*inherited\.temaInput = "";[\s\S]*inherited\.objetivoInput = "";/, "Un tema nuevo no debe heredar tema curricular ni objetivo final.");
assert.match(js, /state\.topics\.some\(\(topic\) => topic\.academicNumber === academicNumber\)/, "No deben permitirse números de tema duplicados.");
assert.match(js, /Mueve la sesión a Borrador antes de crear un tema nuevo/, "Crear temas debe bloquearse en sesiones publicadas.");
assert.match(js, /await flushPendingTopicSave\(\);[\s\S]*await loadTopicIntoEditor\(topic/, "Cambiar de tema debe guardar antes de hidratar el siguiente.");
assert.match(js, /invalidTopics = state\.topics\.filter[\s\S]*temaInput[\s\S]*objetivoInput[\s\S]*validateProjectSetup/, "La publicación debe validar todos los temas.");
assert.match(js, /escaperooms\/\$\{uid\}\/\$\{sessionId\}\/\$\{topicId\}\/cover\.png/, "Los assets deben separarse por tema.");

assert.match(home, /topicSummaries[\s\S]*data-topic-id=[\s\S]*escapeRoom_preview/, "Home debe listar previews por tema.");
assert.match(home, /getDoc\(doc\(db, "escapeRoom", id, "topics", topicId\)\)/, "Home debe cargar el proyecto del tema bajo demanda.");

assert.match(firestoreRules, /match \/topics\/\{topicId\}/, "Firestore debe proteger la subcolección topics.");
assert.match(storageRules, /match \/escaperooms\/\{uid\}\/\{sessionId\}\/\{allPaths=\*\*\}/, "Storage debe aceptar rutas anidadas por tema.");

console.log("PigPen multi-topic sessions OK.");
