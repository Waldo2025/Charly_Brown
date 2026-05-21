import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url),
  "utf8"
);
const podcastDomainSource = readFileSync(
  new URL("../public/podcaster/podcaster-podcast-script-domain.js", import.meta.url),
  "utf8"
);
const chatAssistantSource = readFileSync(
  new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url),
  "utf8"
);

if (!/const PODCAST_DEFAULT_SCENARIO = "Cabina de radio premium/.test(generatorSource)) {
  throw new Error("El generador podcast debe fijar una cabina de radio premium como escenario por defecto.");
}

if (!/function enrichPodcastVisualRows\(rows = \[\], options = \{\}\)/.test(generatorSource)) {
  throw new Error("Falta el enriquecimiento visual específico para podcast.");
}

if (!/function buildPodcastDefaultVisualNotes\(row = \{\}, index = 0\)/.test(generatorSource)) {
  throw new Error("Falta el helper para describir gestos detallados del locutor en podcast.");
}

if (!/const finalRows = videoMode[\s\S]*: finalizePodcastRows\(distinctVideoRows,\s*\{[\s\S]*scenario:\s*PODCAST_DEFAULT_SCENARIO/m.test(generatorSource)) {
  throw new Error("normalizeScriptPayload debe enriquecer media y elemento visual en modo podcast.");
}

if (!/Elemento visual \(visualNotes\), Escenario \(scenePrompt\)/.test(podcastDomainSource)) {
  throw new Error("El prompt de podcast debe exigir las columnas Elemento visual y Escenario.");
}

if (!/Mantén el escenario consistente en todas las escenas: una cabina de radio\/podcast premium\./.test(podcastDomainSource)) {
  throw new Error("El prompt de podcast debe forzar la misma cabina de radio en todas las escenas.");
}

if (!/describe con claridad qué hace el locutor mientras habla, incluyendo postura, ademanes, manos, mirada, ritmo corporal, gestos faciales y energía en cabina/.test(podcastDomainSource)) {
  throw new Error("El prompt de podcast debe pedir gestos y ademanes detallados.");
}

if (!/\| Tiempo \| Locutor \| Nombre del locutor \| Expresión \| Guion \| Media \| Notas \|/.test(chatAssistantSource)) {
  throw new Error("La tabla preview del chat para podcast debe mantener la columna Media y omitir Elemento visual.");
}

if (/const visual = String\(row\?\.visualNotes/.test(chatAssistantSource)) {
  throw new Error("La tabla preview del chat para podcast no debe renderizar la columna Elemento visual.");
}

console.log("Podcaster podcast media and visual enrichment OK.");
