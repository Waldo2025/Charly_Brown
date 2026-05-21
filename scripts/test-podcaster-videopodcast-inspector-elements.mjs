import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url),
  "utf8"
);

// 1. Verify that buildInspectorScriptRowMarkup resolves rowReference when in videoMode or videoPodcastMode
if (!/const rowReference = \(\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\) && rowId\)/.test(editorSource)) {
  throw new Error("buildInspectorScriptRowMarkup debe resolver rowReference tanto en videoMode como en videoPodcastMode.");
}

// 2. Verify that rowReferenceImages is resolved in both modes
if (!/const rowReferenceImages = \(\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\) && rowId\)/.test(editorSource)) {
  throw new Error("buildInspectorScriptRowMarkup debe resolver rowReferenceImages tanto en videoMode como en videoPodcastMode.");
}

// 3. Verify that row-actions-inspector is rendered in both modes
if (!/\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\)\s*\?\s*`\s*<div class="row-actions row-actions-inspector">/s.test(editorSource)) {
  throw new Error("El inspector Snoopy debe mostrar la barra de acciones de la fila tanto en videoMode como en videoPodcastMode.");
}

// 4. Verify that inspector-row-reference is rendered in both modes
if (!/\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\)\s*\?\s*`\s*<div class="inspector-row-reference">/s.test(editorSource)) {
  throw new Error("El inspector Snoopy debe mostrar la previsualización de referencia de fila tanto en videoMode como en videoPodcastMode.");
}

// 5. Verify that buildPodcastReferenceSectionsMarkup is rendered unconditionally in buildInspectorScriptRowMarkup
if (!/\${buildPodcastReferenceSectionsMarkup\(session, speaker\)}/.test(editorSource)) {
  throw new Error("El inspector Snoopy debe renderizar buildPodcastReferenceSectionsMarkup incondicionalmente para todos los modos.");
}

// 6. Verify that row-chip-public is checked in both modes
if (!/\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\) && String\(row\?\.publicSceneLibraryId \|\| ""\)\.trim\(\)/.test(editorSource)) {
  throw new Error("buildScriptRowCard debe mostrar el chip de pública tanto en videoMode como en videoPodcastMode.");
}

// 7. Verify that row floating menu attachments are checked in both modes
if (!/\(panelCopy\.videoMode \|\| panelCopy\.videoPodcastMode\)\s*\?\s*\(\(\) => \{/s.test(editorSource)) {
  throw new Error("buildScriptRowCard debe mostrar el menú flotante de adjuntar referencias tanto en videoMode como en videoPodcastMode.");
}

console.log("Podcaster video-podcast inspector elements verification test OK.");
