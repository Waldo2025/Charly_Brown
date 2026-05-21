import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/Locutor de referencia/.test(editorSource)) {
  throw new Error("El inspector Snoopy debe renderizar la sección 'Locutor de referencia' en podcast.");
}

if (!/Escenario/.test(editorSource) || !/data-action="attach-scenario-reference-image"/.test(editorSource)) {
  throw new Error("El inspector Snoopy debe renderizar la sección de escenario con acción para adjuntar referencia.");
}

if (!/function buildPodcastReferenceSectionsMarkup\(session,\s*speaker = "Host A"\)/.test(editorSource)) {
  throw new Error("El editor debe centralizar las secciones de referencias de podcast en un helper compartido.");
}

if (!/const podcastReferenceSections = !isVideo\s*\?\s*buildPodcastReferenceSectionsMarkup\(session,\s*host\)\s*:\s*"";/.test(editorSource)) {
  throw new Error("El editor de fila también debe mostrar las secciones de referencia en podcast y podcast con video.");
}

if (!/data-field="scenario" data-host-name=/.test(editorSource)) {
  throw new Error("El editor de fila debe mostrar el campo de escenario también en podcast.");
}

if (!/podcastStudioInspectorRowEditor\.addEventListener\("click", async \(event\) => \{[\s\S]*attach-speaker-reference-image[\s\S]*attach-scenario-reference-image/s.test(podcasterSource)) {
  throw new Error("El inspector Snoopy debe manejar clicks de referencias de locutor y escenario.");
}

console.log("Podcaster inspector podcast reference sections OK.");
