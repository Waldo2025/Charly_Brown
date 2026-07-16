import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const enhancerStart = generatorSource.indexOf("async function enhanceEducationalVideoOnScreenTextWithGemini");
const enhancerEnd = generatorSource.indexOf("\nfunction buildOnScreenText", enhancerStart);
assert.ok(enhancerStart >= 0 && enhancerEnd > enhancerStart, "No se encontró el enhancer de titulares.");
const enhancer = generatorSource.slice(enhancerStart, enhancerEnd);

assert.match(enhancer, /Tarea: podcaster_headline_copy_v2\./);
assert.match(enhancer, /titular opcional de 2 a 6 palabras y máximo 48 caracteres/);
assert.match(enhancer, /conservar acentos y no copiar ni truncar las primeras palabras del guion/);
assert.match(enhancer, /Usa null cuando un titular no aporte valor/);
assert.match(enhancer, /headlineText:\s*\{ type: "string", nullable: true \}/);
assert.match(enhancer, /temperature:\s*0\.25/);
assert.match(enhancer, /taskProfile:\s*"podcaster_headline_copy_v2"/);
assert.match(enhancer, /model:\s*"gemini-3\.5-flash"/);

assert.match(
  enhancer,
  /const isManual = sourceRow\?\.textSource === "manual";[\s\S]*const headlineText = isManual[\s\S]*normalizeSimpleText\(sourceRow\?\.headlineText \|\| ""\)/,
  "El enhancer no debe sobrescribir un titular manual."
);
assert.match(
  enhancer,
  /mapped\.set\(index, isWeakOnScreenText\(candidate\) \? "" : candidate\)/,
  "Una salida inválida debe quedar vacía, no truncarse con las primeras palabras del diálogo."
);
assert.doesNotMatch(
  enhancer,
  /trimWords\(|\.slice\(0,\s*6\)|guion\.split/,
  "El titular no debe construirse recortando el guion."
);

assert.match(backendSource, /const isHeadlineTask = taskProfile === "podcaster_headline_copy_v2";/);
assert.match(backendSource, /const isCreativeVideoTask = taskProfile === "podcaster_creative_video_script_v2";/);
assert.match(
  backendSource,
  /const isCreativeVideoPayload = \(payload = \{\}\) => \{\s*void payload;\s*return isCreativeVideoTask;\s*\};/,
  "La clasificación creativa debe depender del perfil explícito, no de palabras del prompt."
);
assert.match(
  backendSource,
  /if \(isHeadlineTask\)[\s\S]*payload\.generationConfig\.temperature = 0\.25;/,
  "El backend debe fijar la temperatura editorial aunque el cliente envíe otra."
);

console.log("Podcaster headline copy v2 contract OK.");
