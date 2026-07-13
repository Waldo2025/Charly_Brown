import assert from "node:assert/strict";
import fs from "node:fs";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const mediaEditorSource = fs.readFileSync(`${root}/public/podcaster/podcaster-media-editor.js`, "utf8");
const podcasterSource = fs.readFileSync(`${root}/public/podcaster/podcaster.js`, "utf8");

assert.match(
  mediaEditorSource,
  /function initPodcasterMediaEditor\(\) \{[\s\S]*mediaEditorInitialized[\s\S]*initElements\(\);[\s\S]*setupEventListeners\(\);[\s\S]*mediaEditorInitialized = true;/m,
  "El módulo de texto estilizado debe tener inicialización idempotente."
);

assert.match(
  mediaEditorSource,
  /if \(document\.readyState === 'loading'\) \{[\s\S]*DOMContentLoaded[\s\S]*\} else \{[\s\S]*initPodcasterMediaEditor\(\);[\s\S]*\}/m,
  "El botón addStylizedTextBtn debe recibir listener aunque el módulo cargue después de DOMContentLoaded."
);

assert.match(
  mediaEditorSource,
  /if \(els\.addStylizedTextBtn\) \{[\s\S]*els\.addStylizedTextBtn\.addEventListener\('click', openStylizedTextEditor\);[\s\S]*\}/m,
  "El listener del botón de texto estilizado debe registrarse con guard de elemento."
);

assert.doesNotMatch(
  mediaEditorSource,
  /window\.PodcasterState\.activeRowId\s*=/,
  "El módulo no debe asignar directo a PodcasterState.activeRowId; usa PodcasterUI para seleccionar fila."
);

assert.match(
  podcasterSource,
  /set activeRowId\(rowId\) \{[\s\S]*setPodcastVideoRow\(key, \{ syncStage: true, lightweightUi: true \}\);[\s\S]*\}/m,
  "PodcasterState.activeRowId debe exponer setter seguro para módulos legacy."
);

assert.match(
  podcasterSource,
  /window\.PodcasterUI = \{[\s\S]*selectTimelineSceneRow:[\s\S]*setPodcastVideoRow:/m,
  "PodcasterUI debe exponer selección de escena para módulos externos."
);

console.log("Podcaster stylized text button late module init OK.");
