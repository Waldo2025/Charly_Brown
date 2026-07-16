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
  assert.equal(normalizeVideoTableHeaderKey("Texto en pantalla"), "headlineText");
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
    headlineText: "IDEA CENTRAL",
    onScreenText: "IDEA CENTRAL",
    captionText: "",
    inSceneText: "",
    overlayMode: "headline",
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
  assert.equal(rows[0].captionText, "");
  assert.equal(rows[0].transition, "Corte directo");
  assert.equal(rows[0].visual, "Mapa animado");
});

test("only an explicit subtitle heading populates captionText", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Descripción", "Subtítulos", "Transición", "Elemento visual"],
    ["Hola mundo", "Set nocturno", "Hola mundo", "Fundido", "Luz azul"]
  ]);

  assert.equal(rows[0].headlineText, "");
  assert.equal(rows[0].onScreenText, "");
  assert.equal(rows[0].captionText, "Hola mundo");
  assert.equal(rows[0].transition, "Fundido");
});

test("a table without a text column leaves text empty and never copies transition into it", () => {
  const rows = normalizeEducationalVideoTableRows([
    ["Guion", "Descripción de escena", "Transición", "Elemento visual"],
    ["Frase", "Exterior lluvioso", "Barrido lateral", "Paraguas rojo"]
  ]);

  assert.equal(rows[0].headlineText, "");
  assert.equal(rows[0].captionText, "");
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
  assert.equal(result.rows[0].headlineText, "CADA SEGUNDO");
  assert.equal(result.rows[0].captionText, "");
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
    /return \{ \.\.\.row, \.\.\.normalize\(row\) \};/,
    "the text-field normalizer must not discard Guion or scene description"
  );

  const start = podcaster.indexOf("function normalizeRows(raw)");
  const end = podcaster.indexOf("function normalizeVoiceNameSource", start);
  assert.ok(start >= 0 && end > start);
  const normalizeRows = Function(`${podcaster.slice(start, end)}; return normalizeRows;`)();
  const canonical = { script: "Guion desde tabla", sceneDescription: "Descripción desde tabla" };
  assert.deepEqual(normalizeRows([canonical]), [canonical]);
});
