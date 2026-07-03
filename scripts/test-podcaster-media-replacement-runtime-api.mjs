import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-replacement.js",
  "utf8"
);

if (!/function registerPodcasterMediaReplacementApi\(\)/.test(source)) {
  throw new Error("podcaster-media-replacement.js debe centralizar el registro de PodcasterMediaReplacement.");
}

if (!/registerPodcasterMediaReplacementApi\(\);[\s\S]*async function openSceneVideoSelectorModal/.test(source)) {
  throw new Error("PodcasterMediaReplacement debe registrarse antes de depender de DOMContentLoaded.");
}

if (!/openSceneVideoSelectorModal/.test(source.match(/window\.PodcasterMediaReplacement = \{[\s\S]*?\};/)?.[0] || "")) {
  throw new Error("PodcasterMediaReplacement debe exponer openSceneVideoSelectorModal en el registro global.");
}

if (!/if \(document\.readyState === "loading"\)[\s\S]*initPodcasterMediaReplacementDom\(\);/.test(source)) {
  throw new Error("podcaster-media-replacement.js debe inicializarse aunque DOMContentLoaded ya haya ocurrido.");
}

if (!/if \(!els\.modal\) \{\s*initElements\(\);\s*\}/.test(source)) {
  throw new Error("openSceneVideoSelectorModal debe rehidratar elementos si el módulo fue cargado tarde.");
}

console.log("Podcaster media replacement runtime API OK.");
