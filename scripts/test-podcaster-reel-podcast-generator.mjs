import { readFileSync } from "node:fs";

const reelGeneratorJs = readFileSync(
  new URL("../public/podcaster/podcaster-reel-podcast-generator.js", import.meta.url),
  "utf8"
);
const generatorJs = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url),
  "utf8"
);
const podcasterHtml = readFileSync(
  new URL("../public/podcaster.html", import.meta.url),
  "utf8"
);

// 1. Structural Checks on podcaster-reel-podcast-generator.js
if (!/buildReelPodcastSystemInstruction/.test(reelGeneratorJs)) {
  throw new Error("podcaster-reel-podcast-generator.js debe exportar buildReelPodcastSystemInstruction.");
}

if (!/Derivando|QuantumFracture|Matemáticas con Juan/.test(reelGeneratorJs)) {
  throw new Error("El sistema de guiones Reel debe imitar el estilo de youtubers educativos como Derivando, QuantumFracture o Matemáticas con Juan.");
}

if (!/UN SOLO LOCUTOR \(Monólogo\)/.test(reelGeneratorJs)) {
  throw new Error("El prompt de Reels debe especificar monólogo y evitar diálogos grupales.");
}

if (!/EL GANCHO INICIAL/.test(reelGeneratorJs)) {
  throw new Error("El prompt de Reels debe exigir un gancho inicial fuerte en los primeros 3 segundos.");
}

if (!/EXPLICACIÓN SIEMPRE CON EJEMPLOS CONCRETOS Y COTIDIANOS/.test(reelGeneratorJs)) {
  throw new Error("El prompt de Reels debe mandar explicaciones con ejemplos cotidianos y analogías.");
}

if (!/CUES VISUALES Y DE EDICIÓN DINÁMICAS/.test(reelGeneratorJs)) {
  throw new Error("El prompt de Reels debe exigir ademanes y zooms/textos gigantes en visualNotes.");
}

if (!/forceSingleSpeakerOnReel/.test(reelGeneratorJs)) {
  throw new Error("podcaster-reel-podcast-generator.js debe forzar un solo presentador en los datos normalizados.");
}

if (!/window\.generateReelPodcastScript\s*=\s*generateReelPodcastScript;/.test(reelGeneratorJs)) {
  throw new Error("podcaster-reel-podcast-generator.js debe exponer generateReelPodcastScript en window.");
}

if (!/window\.buildReelPodcastScriptFromPromptTable\s*=\s*buildReelPodcastScriptFromPromptTable;/.test(reelGeneratorJs)) {
  throw new Error("podcaster-reel-podcast-generator.js debe exponer buildReelPodcastScriptFromPromptTable en window.");
}

// 2. Routing Checks on podcaster-script-generator.js
if (!/import\s*\{\s*generateReelPodcastScript,\s*buildReelPodcastScriptFromPromptTable\s*\}\s*from\s*"\\?\.?\/podcaster-reel-podcast-generator\.js";?/m.test(generatorJs)) {
  throw new Error("podcaster-script-generator.js debe importar las funciones desde podcaster-reel-podcast-generator.js.");
}

if (!/if\s*\(sessionSnapshot\?\.podcastVideoConfig\?\.reelModeEnabled\s*===\s*true\)\s*\{\s*return\s+generateReelPodcastScript\(prompt,\s*sessionSnapshot,\s*constraints\);\s*\}/m.test(generatorJs)) {
  throw new Error("generatePodcastScript debe enrutar a generateReelPodcastScript cuando el modo Reel está activo.");
}

if (!/if\s*\(sessionBeforeUpdate\?\.podcastVideoConfig\?\.reelModeEnabled\s*===\s*true\)\s*\{\s*script\s*=\s*await\s+buildReelPodcastScriptFromPromptTable/m.test(generatorJs)) {
  throw new Error("handleGenerate en tableMode === 'compose' debe enrutar a buildReelPodcastScriptFromPromptTable cuando el modo Reel está activo.");
}

// 3. Script Loading Checks on podcaster.html
if (!/src="podcaster\/podcaster-reel-podcast-generator\.js"/.test(podcasterHtml)) {
  throw new Error("podcaster.html debe cargar podcaster-reel-podcast-generator.js.");
}

console.log("Podcaster reel podcast generator routing and structural checks OK.");
