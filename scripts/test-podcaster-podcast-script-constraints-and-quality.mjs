import { readFileSync } from "node:fs";

const generatorJs = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url),
  "utf8"
);
const podcastDomainJs = readFileSync(
  new URL("../public/podcaster/podcaster-podcast-script-domain.js", import.meta.url),
  "utf8"
);
const podcasterJs = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/return requirePodcastScriptDomainApiFunction\("buildPodcastScriptFromPromptTable"\)\(prompt,\s*session,\s*constraints\);/m.test(generatorJs)) {
  throw new Error("podcaster-script-generator.js debe delegar la tabla de podcast al dominio separado.");
}

if (!/let normalized = normalizeScriptPayload\(script,\s*\{\s*session,\s*videoMode:\s*false,\s*hosts:\s*resolvedHosts,\s*skipOptimize:\s*Boolean\(resolvedSceneCount > 0 \|\| resolvedMinWords > 0 \|\| resolvedMaxWords > 0\)\s*\}\);[\s\S]*normalized = applyScriptGenerationConstraints\(normalized,\s*resolvedConstraints,\s*session\);[\s\S]*normalized = forceHostsAndAlternation\(normalized,\s*resolvedConstraints,\s*session\);/m.test(podcastDomainJs)) {
  throw new Error("buildPodcastScriptFromPromptTable debe aplicar hosts y límites de palabras después de normalizar.");
}

if (!/const sentences = splitTextIntoSentences\(text\);[\s\S]*splitLongSentenceIntoChunks\(cleanSentence,\s*maxWords\)[\s\S]*chunks\.push\(ensureCompleteSentence\(bucket\)\);/m.test(generatorJs)) {
  throw new Error("enforceSceneWordBounds debe dividir guiones podcast por oraciones completas, no por bloques ciegos de palabras.");
}

if (!/return normalizeScriptPayload\(\{\s*\.\.\.\(script \|\| \{\}\),\s*hosts:\s*forcedHosts,\s*rows\s*\},\s*\{\s*session,\s*skipOptimize:\s*Boolean\(hasSceneCount \|\| hasWordBounds\)\s*\}\);/m.test(generatorJs)) {
  throw new Error("applyScriptGenerationConstraints debe desactivar optimizeRowsForShortScenes cuando hay sceneCount o límites de palabras.");
}

if (/text:\s*\(!videoMode && maxWords > 0\)\s*\?\s*trimWords\(text,\s*maxWords\)\s*:\s*text/m.test(podcasterJs)) {
  throw new Error("forceHostsAndAlternation no debe recortar el diálogo podcast con trimWords; debe conservar frases completas.");
}

if (/durationSec:\s*Math\.max\(SHORT_SCENE_MIN_SEC,\s*Math\.min\(SHORT_SCENE_MAX_SEC,\s*Math\.round\(estimateSpeechDurationSec\(text\)\)\)\)/m.test(generatorJs)) {
  throw new Error("Las escenas podcast con límites de palabras no deben seguir forzando duración corta de 6-7 segundos.");
}

if (!/const resolvedConstraints = normalizeGenerationConstraints\(\{\s*\.\.\.\(constraints && typeof constraints === "object" \? constraints : \{\}\),\s*videoMode:\s*false\s*\}\);/m.test(podcastDomainJs)) {
  throw new Error("buildPodcastScriptFromPromptTable debe normalizar constraints explícitas del flujo de generación.");
}

if (!/const resolvedHosts = Array\.isArray\(resolvedConstraints\?\.hosts\)/m.test(podcastDomainJs)) {
  throw new Error("buildPodcastScriptFromPromptTable debe derivar hosts desde constraints normalizadas.");
}

if (!/const resolvedMinWords = Number\(resolvedConstraints\?\.minWords \|\| 0\) \|\| 0;/m.test(podcastDomainJs)) {
  throw new Error("buildPodcastScriptFromPromptTable debe leer minWords desde constraints normalizadas.");
}

if (!/const resolvedMaxWords = Number\(resolvedConstraints\?\.maxWords \|\| 0\) \|\| 0;/m.test(podcastDomainJs)) {
  throw new Error("buildPodcastScriptFromPromptTable debe leer maxWords desde constraints normalizadas.");
}

if (!/Analiza el tema con criterio editorial antes de proponer el guion\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe exigir análisis editorial del tema antes de escribir el guion.");
}

if (!/Evita generalidades vacías, intros de relleno y consejos obvios; cada escena debe aportar una idea concreta, ejemplo, contraste, dato o implicación útil\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe prohibir guiones genéricos y exigir densidad informativa.");
}

if (!/Antes de escribir, analiza el tema como editor: detecta el angulo mas util para la audiencia, las dudas clave, los errores comunes, las implicaciones practicas y los ejemplos que vuelven la explicacion memorable\./m.test(podcastDomainJs)) {
  throw new Error("El prompt base de podcast debe pedir analisis editorial del tema antes de escribir.");
}

if (!/Evita guiones genericos\. Cada escena debe aportar una idea concreta, una explicacion clara, un contraste, una mini anécdota, un ejemplo practico, una objecion comun o una consecuencia real para el oyente\./m.test(podcastDomainJs)) {
  throw new Error("El prompt base de podcast debe exigir valor concreto por escena.");
}

if (!/Cada intervención debe estar escrita en frases completas y naturales\. Prohibido devolver fragmentos telegráficos, bullets disfrazados de diálogo o ideas cortadas a la mitad\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe exigir frases completas.");
}

if (!/Haz la conversación más dinámica: alterna preguntas incisivas, respuestas claras, repreguntas útiles, desacuerdos elegantes, ejemplos y reacciones breves que hagan avanzar la idea\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe exigir más interacción entre locutores.");
}

if (!/Cada escena debe ser autosuficiente y cerrar la idea con puntuación completa\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe exigir escenas autosuficientes.");
}

if (!/Está prohibido cortar una frase entre dos escenas o comenzar una escena con una continuación gramatical de la anterior\./m.test(podcastDomainJs)) {
  throw new Error("El prompt de podcast debe prohibir escenas partidas entre filas consecutivas.");
}

if (!/const normalizedHosts = videoMode\s*\?\s*\["Narrador"\]\s*:\s*\(hosts\.length \? hosts : \["Host A", "Host B"\]\);/m.test(generatorJs)) {
  throw new Error("normalizeScriptPayload debe seguir usando hosts configurados en modo podcast.");
}

if (!/function polishPodcastDialogueRows\(rows = \[\], options = \{\}\)/m.test(podcastDomainJs)) {
  throw new Error("El generador debe pulir las filas de podcast antes de devolverlas.");
}

if (!/const finalRows = videoMode[\s\S]*: finalizePodcastRows\(distinctVideoRows,\s*\{[\s\S]*hosts:\s*normalizedHosts,[\s\S]*session:\s*sourceSession,[\s\S]*scenario:\s*PODCAST_DEFAULT_SCENARIO[\s\S]*\}\)/m.test(generatorJs)) {
  throw new Error("normalizeScriptPayload debe pulir y enriquecer las filas de podcast con media y visual.");
}

if (!/async function generateWithGeminiStrictConstraints\(prompt,\s*sessionSnapshot,\s*constraints = \{\}\)\s*\{\s*return requirePodcasterScriptGeneratorApiFunction\("generateWithGeminiStrictConstraints"\)\(prompt,\s*sessionSnapshot,\s*constraints\);\s*\}/m.test(podcasterJs)) {
  throw new Error("podcaster.js debe delegar generateWithGeminiStrictConstraints al módulo del script generator.");
}

if (!/async function generateWithGeminiStrictConstraints\(prompt,\s*sessionSnapshot,\s*constraints = \{\}\)\s*\{[\s\S]*let normalized = applyScriptGenerationConstraints\(generated,\s*strict,\s*sessionSnapshot\);[\s\S]*normalized = forceHostsAndAlternation\(normalized,\s*strict,\s*sessionSnapshot\);/m.test(generatorJs)) {
  throw new Error("El módulo del script generator debe concentrar la ruta strict que reaplica constraints y alternancia.");
}

if (!/await generatePodcastScript\(composedPrompt,\s*sessionSnapshot,\s*\{\s*\.\.\.strict,\s*forceNewScript:\s*true\s*\}\)/m.test(generatorJs)) {
  throw new Error("La ruta strict de podcast debe forzar un script nuevo y no reutilizar el guion anterior como contexto.");
}

if (!/sceneLengthInstruction:\s*forcedMinWords > 0 \|\| forcedMaxWords > 0[\s\S]*No priorices escenas de 6-7 segundos en este caso\./m.test(generatorJs)) {
  throw new Error("La ruta strict de podcast debe reemplazar la regla de escenas de 6-7 segundos cuando hay rango de palabras forzado.");
}

if (!/if \(text && !\/\[\.!\?…\]\$\/\.test\(text\)\) \{[\s\S]*if \(\/\^\[a-záéíóúñü\]\/\.test\(text\)\) \{[\s\S]*if \(\/\^continuaci\[oó\]n\\b\/i\.test\(String\(row\?\.notes \|\| \"\"\)\.trim\(\)\)\) \{/m.test(generatorJs)) {
  throw new Error("La validación strict de podcast debe detectar escenas cortadas o marcadas como continuación.");
}

console.log("Podcaster podcast script constraints and quality OK.");
