import { readFileSync } from "node:fs";

const htmlSource = readFileSync(
  new URL("../public/podcaster.html", import.meta.url),
  "utf8"
);
const generatorSource = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url),
  "utf8"
);
const scriptGeneratorRegistrySource = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator-registry.js", import.meta.url),
  "utf8"
);
const podcastDomainSource = readFileSync(
  new URL("../public/podcaster/podcaster-podcast-script-domain.js", import.meta.url),
  "utf8"
);
const videoDomainSource = readFileSync(
  new URL("../public/podcaster/podcaster-video-script-domain.js", import.meta.url),
  "utf8"
);

if (!htmlSource.includes('src="podcaster/podcaster-podcast-script-domain.js')) {
  throw new Error("podcaster.html debe cargar el dominio de guion podcast.");
}

if (!htmlSource.includes('src="podcaster/podcaster-video-script-domain.js')) {
  throw new Error("podcaster.html debe cargar el dominio de guion video.");
}

if (!/globalThis\.PodcasterPodcastScriptDomain\s*=\s*\{/.test(podcastDomainSource)) {
  throw new Error("El dominio podcast debe exponer PodcasterPodcastScriptDomain.");
}

if (!/globalThis\.PodcasterVideoScriptDomain\s*=\s*\{/.test(videoDomainSource)) {
  throw new Error("El dominio video debe exponer PodcasterVideoScriptDomain.");
}

if (!/requirePodcastScriptDomainApiFunction\("buildPodcastSystemInstruction"\)\(\)/.test(generatorSource)) {
  throw new Error("El generador principal debe consumir el system instruction del dominio podcast.");
}

if (!/requireVideoScriptDomainApiFunction\("buildVideoSystemInstruction"\)\([^)]*\)/.test(generatorSource)) {
  throw new Error("El generador principal debe consumir el system instruction del dominio video.");
}

if (!/requirePodcastScriptDomainApiFunction\("generatePodcastFallbackScript"\)\(prompt,\s*options\)/.test(generatorSource)) {
  throw new Error("El fallback podcast debe vivir en el dominio podcast.");
}

if (!/requireVideoScriptDomainApiFunction\("buildCreativeVideoScriptFromPromptTable"\)\(prompt,\s*session\)/.test(generatorSource)) {
  throw new Error("La tabla de video debe delegarse al dominio video.");
}

if (!/registerPodcasterScriptGeneratorApi\(\{/.test(generatorSource)) {
  throw new Error("podcaster-script-generator.js debe registrar su API modular.");
}

if (!/export function requirePodcasterScriptGeneratorApiFunction\(/.test(scriptGeneratorRegistrySource)) {
  throw new Error("El registry del script generator debe exponer requirePodcasterScriptGeneratorApiFunction.");
}

console.log("Podcaster script domain split OK.");
