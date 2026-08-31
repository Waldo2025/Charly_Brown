import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  normalizeVideoTableHeaderKey,
  normalizeEducationalVideoTableRows,
  validateDirectVideoTableRows
} from "../public/podcaster/podcaster-video-table-mapping.js";

test("recognizes the old table headings and the chat's editorial-title alias", () => {
  assert.equal(normalizeVideoTableHeaderKey("Descripción de escena"), "sceneDescription");
  assert.equal(normalizeVideoTableHeaderKey("Texto en pantalla"), "inSceneText");
  assert.equal(normalizeVideoTableHeaderKey("Titular editorial"), "headlineText");
  assert.equal(normalizeVideoTableHeaderKey("Transición"), "transition");
  assert.equal(normalizeVideoTableHeaderKey("Elemento visual"), "visual");
  assert.equal(normalizeVideoTableHeaderKey("Subtítulos / karaoke"), "captionText");
});

test("maps a five-column table without Tiempo by headings instead of shifting cells", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Descripción de escena", "Texto en pantalla", "Transición", "Elemento visual"],
    ["Narración exacta", "Una biblioteca cálida", "IDEA CENTRAL", "Disolvencia suave", "Libro abierto"]
  ]);

  assert.equal(rows.length, 1, "the heading must not become an extra scene");
  assert.deepEqual(rows[0], {
    time: "00:00-00:08",
    script: "Narración exacta",
    sceneDescription: "Una biblioteca cálida",
    headlineText: "",
    onScreenText: "Narración exacta",
    captionText: "Narración exacta",
    inSceneText: "IDEA CENTRAL",
    overlayMode: "captions",
    onScreenTextNoSummarize: true,
    transition: "Disolvencia suave",
    visual: "Libro abierto"
  });
});

test("ignores an Escena ordinal column and preserves reordered columns", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Escena", "Elemento visual", "Transición", "Guion", "Descripción", "Titular editorial"],
    ["14", "Mapa animado", "Corte directo", "Texto hablado", "Sala de edición", "NUEVA ETAPA"]
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].script, "Texto hablado");
  assert.equal(rows[0].sceneDescription, "Sala de edición");
  assert.equal(rows[0].headlineText, "NUEVA ETAPA");
  assert.equal(rows[0].captionText, "Texto hablado");
  assert.equal(rows[0].overlayMode, "both");
  assert.equal(rows[0].transition, "Corte directo");
  assert.equal(rows[0].visual, "Mapa animado");
});

test("keeps editorial headline, literal caption, and in-scene text as separate contracts", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Texto en pantalla", "Titular editorial", "Subtítulos / karaoke", "Descripción", "Elemento visual"],
    ["Guion autoritativo", "LETRERO DEL SET", "IDEA EDITORIAL", "Texto personalizado ignorado", "Estudio", "Pantalla"]
  ]);

  assert.equal(rows[0].headlineText, "IDEA EDITORIAL");
  assert.equal(rows[0].captionText, "Guion autoritativo");
  assert.equal(rows[0].inSceneText, "LETRERO DEL SET");
  assert.equal(rows[0].overlayMode, "both");
  assert.equal(rows[0].onScreenText, "IDEA EDITORIAL\nGuion autoritativo");
});

test("Guion remains the authoritative caption even with an explicit subtitle heading", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Descripción", "Subtítulos", "Transición", "Elemento visual"],
    ["Hola mundo", "Set nocturno", "Hola mundo", "Fundido", "Luz azul"]
  ]);

  assert.equal(rows[0].headlineText, "");
  assert.equal(rows[0].onScreenText, "Hola mundo");
  assert.equal(rows[0].captionText, "Hola mundo");
  assert.equal(rows[0].transition, "Fundido");
});

test("a table without a text column leaves text empty and never copies transition into it", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Descripción de escena", "Transición", "Elemento visual"],
    ["Frase", "Exterior lluvioso", "Barrido lateral", "Paraguas rojo"]
  ]);

  assert.equal(rows[0].headlineText, "");
  assert.equal(rows[0].captionText, "Frase");
  assert.equal(rows[0].overlayMode, "captions");
  assert.equal(rows[0].transition, "Barrido lateral");
});

test("direct-table validation shares the same mapping", () => {
  const result = validateDirectVideoTableRows([
    ["Elemento visual", "Descripción de escena", "Guion", "Texto en pantalla", "Transición"],
    ["Reloj macro", "Mesa de madera", "El tiempo importa.", "CADA SEGUNDO", "Zoom suave"]
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sceneDescription, "Mesa de madera");
  assert.equal(result.rows[0].headlineText, "");
  assert.equal(result.rows[0].inSceneText, "CADA SEGUNDO");
  assert.equal(result.rows[0].captionText, "El tiempo importa.");
  assert.equal(result.rows[0].transition, "Zoom suave");
});

test("inferred time ranges remain valid after one minute", () => {
  const input = [{ script: "Uno", sceneDescription: "Set", visual: "Objeto" }];
  for (let index = 1; index < 9; index += 1) {
    input.push({ script: `Fila ${index + 1}`, sceneDescription: "Set", visual: "Objeto" });
  }
  const rows = normalizeEducationalVideoTableRows(input);
  assert.equal(rows[8].time, "01:04-01:12");
});

test("sequence editors expose only the original five data fields", () => {
  const editor = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");
  const inspector = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  const editorStart = editor.indexOf('<div class="script-row-grid">');
  const inspectorStart = inspector.indexOf("function renderCreativeInspector");
  const editorMarkup = editor.slice(editorStart, editorStart + 10000);
  const inspectorMarkup = inspector.slice(inspectorStart, inspectorStart + 14000);

  for (const source of [editorMarkup, inspectorMarkup]) {
    assert.match(source, /data-field="voiceOverText"/);
    assert.match(source, /data-field="sceneDescription"/);
    assert.match(source, /data-field="onScreenText"/);
    assert.match(source, /data-field="onScreenText"[^>]*readonly[^>]*aria-readonly="true"/);
    assert.match(source, /data-field="transition"/);
    assert.match(source, /data-field="visualNotes"/);
    assert.doesNotMatch(source, /data-field="captionText"/);
    assert.doesNotMatch(source, /data-field="overlayMode"/);
    assert.doesNotMatch(source, /data-field="inSceneText"/);
  }
});

test("panel connection keeps video mode and accepts canonical table rows before IDs exist", () => {
  const generator = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
  const podcaster = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

  assert.match(
    generator,
    /compactScriptForPanelConnection\(scriptSnapshot \|\| \{\}, session, \{[\s\S]*?videoMode: options\?\.videoMode === true[\s\S]*?\}\)/,
    "the connection must not infer podcast mode from mutable UI state"
  );
  assert.match(
    podcaster,
    /voiceOverText:\s*String\(row\?\.voiceOverText \|\| row\?\.text \|\| row\?\.guion \|\| row\?\.script/,
    "the connected display row must materialize Guion into voiceOverText"
  );
  assert.match(
    editor,
    /creativeRow\.voiceOverText \|\| creativeRow\.text \|\| creativeRow\.guion \|\| creativeRow\.script/,
    "the visible Guion field must retain legacy and table aliases"
  );
  assert.match(
    editor,
    /creativeRow\.sceneDescription \|\| creativeRow\.scenePrompt \|\| creativeRow\.descripcionEscena/,
    "the visible scene description must retain table aliases"
  );
  assert.match(
    editor,
    /return \{ \.\.\.row, \.\.\.normalize\(row, options\) \};/,
    "the text-field normalizer must not discard Guion or scene description"
  );

  const start = podcaster.indexOf("function normalizeRows(raw)");
  const end = podcaster.indexOf("function normalizeVoiceNameSource", start);
  assert.ok(start >= 0 && end > start);
  const normalizeRows = Function(`${podcaster.slice(start, end)}; return normalizeRows;`)();
  const canonical = { script: "Guion desde tabla", sceneDescription: "Descripción desde tabla" };
  assert.deepEqual(normalizeRows([canonical]), [canonical]);
});

test("maps object aliases and legacy positional tables into inSceneText", () => {
  const objects = normalizeEducationalVideoTableRows([{
    guion: "Guion literal",
    descripcionEscena: "Un estudio",
    textoPantalla: "RÓTULO INTEGRADO",
    elementoVisual: "Micrófono"
  }]);
  assert.equal(objects[0].inSceneText, "RÓTULO INTEGRADO");
  assert.equal(objects[0].headlineText, "");
  assert.equal(objects[0].captionText, "Guion literal");

  const positional = normalizeEducationalVideoTableRows([
    ["La narración heredada explica el tema.", "Biblioteca iluminada", "TEXTO ANTIGUO", "Corte", "Objeto"]
  ]);
  assert.equal(positional[0].inSceneText, "TEXTO ANTIGUO");
  assert.equal(positional[0].captionText, "La narración heredada explica el tema.");
});

test("panel connection preserves text already present in the inspector", () => {
  const generator = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
  const start = generator.indexOf("function preserveExistingInspectorText");
  const end = generator.indexOf("function setButtonLoadingState", start);
  assert.ok(start >= 0 && end > start);
  const preserveExistingInspectorText = Function(
    `${generator.slice(start, end)}; return preserveExistingInspectorText;`
  )();

  const incoming = { id: "new-row", inSceneText: "Texto recibido desde chat" };
  const existing = { id: "old-row", inSceneText: "Texto escrito manualmente" };
  assert.deepEqual(preserveExistingInspectorText(incoming, existing), {
    id: "new-row",
    inSceneText: "Texto escrito manualmente",
    inSceneTextEditedStored: true
  });
  assert.deepEqual(
    preserveExistingInspectorText(incoming, { id: "old-row", inSceneText: "" }),
    incoming
  );
  assert.match(generator, /existingRow = \(incomingId && currentRowsById\.get\(incomingId\)\) \|\| currentRows\[index\]/);
});
