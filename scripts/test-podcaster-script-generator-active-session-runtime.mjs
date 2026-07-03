import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-script-generator.js",
  "utf8"
);

if (!/getActiveSession:\s*windowGetActiveSession/.test(source)) {
  throw new Error("podcaster-script-generator.js no debe congelar getActiveSession desde window durante el bootstrap.");
}

if (!/const getActiveSession = \(\.\.\.args\) => callRuntimeFunction\("getActiveSession", windowGetActiveSession, args\);/.test(source)) {
  throw new Error("podcaster-script-generator.js debe resolver getActiveSession en runtime para soportar el orden de carga de podcaster.html.");
}

if (/[^:\w]getActiveSession,\s*upsertActiveSession,\s*normalizeGenerationConstraints/.test(source)) {
  throw new Error("podcaster-script-generator.js volvió a destructurar getActiveSession/upsertActiveSession como funciones tempranas.");
}

if (!/const DEFAULT_HOSTS = Object\.freeze\(Array\.isArray\(windowDefaultHosts\)/.test(source)) {
  throw new Error("podcaster-script-generator.js debe tener fallback local para DEFAULT_HOSTS antes de que cargue podcaster.js.");
}

if (/els\.scriptModelSelect\.value/.test(source)) {
  throw new Error("podcaster-script-generator.js no debe leer els.scriptModelSelect directamente porque els puede no existir durante el bootstrap.");
}

if (!/function resolveScriptModelName\(\)[\s\S]*document\.getElementById\("scriptModelSelect"\)/.test(source)) {
  throw new Error("podcaster-script-generator.js debe resolver scriptModelSelect en runtime con fallback al DOM.");
}

if (/state\.activeSessionId/.test(source)) {
  throw new Error("podcaster-script-generator.js no debe leer state.activeSessionId desde una referencia temprana.");
}

if (!/globalThis\.PodcasterChatAssistant\?\.addChatMessage/.test(source)) {
  throw new Error("podcaster-script-generator.js debe resolver addChatMessage desde PodcasterChatAssistant en runtime.");
}

if (!/const logPodcasterLiveDebug = \(\.\.\.args\) =>/.test(source)) {
  throw new Error("podcaster-script-generator.js debe resolver logPodcasterLiveDebug sin congelar una referencia temprana.");
}

console.log("Podcaster script generator active-session runtime contract OK.");
