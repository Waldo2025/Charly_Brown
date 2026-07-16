import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptEditorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");
const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

assert.match(
  scriptEditorSource,
  /data-field="onScreenText"/,
  "El panel de secuencias debe conservar el único campo visible Texto en pantalla."
);
assert.doesNotMatch(
  scriptEditorSource,
  /data-field="captionText"/,
  "El panel de secuencias no debe añadir el campo Subtítulos / karaoke."
);
assert.doesNotMatch(
  scriptEditorSource,
  /data-field="inSceneText"/,
  "El panel de secuencias no debe añadir texto natural dentro del video."
);
assert.doesNotMatch(
  scriptEditorSource,
  /data-field="overlayMode"/,
  "El panel de secuencias no debe añadir un selector de overlay."
);

assert.match(
  podcasterSource,
  /function copyVoiceOverTextToOnScreenText\([\s\S]*headlineText:\s*voiceOverText,[\s\S]*captionText:\s*"",[\s\S]*textSource:\s*"manual"/,
  "Copiar guion debe alimentar el campo único Texto en pantalla y limpiar captions ocultos."
);

assert.match(
  podcasterSource,
  /const editorialFields = new Set\(\["headlineText", "captionText", "inSceneText", "overlayMode", "onScreenText"\]\)/,
  "El alias visible onScreenText debe entrar al contrato editorial interno."
);
assert.match(
  podcasterSource,
  /editorialFields\.has\(field\)[\s\S]*textSource:\s*"manual"/,
  "Una edición directa debe conservarse como manual."
);

assert.match(
  timelineUiSource,
  /const canonicalResolver = window\.PodcasterOnScreenTextRenderSpec\?\.resolvePodcasterSceneOverlayText/,
  "El timeline debe usar el mismo resolver canónico que preview y export."
);
assert.match(
  timelineUiSource,
  /const nextText = resolveSceneOverlayText\(row\) \|\| "Sin texto";[\s\S]*contentEl\.textContent = nextText;/,
  "El refresco ligero del timeline debe mostrar exclusivamente la pista editorial resuelta."
);
assert.doesNotMatch(
  timelineUiSource,
  /resolveSceneOverlayText\([\s\S]{0,400}?row\?\.text/,
  "El timeline no debe usar el diálogo como fallback de overlay."
);

console.log("Podcaster canonical editorial text preservation OK.");
