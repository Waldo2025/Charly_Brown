import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../public/podcaster/podcaster-runtime-registry.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

const runtimeApiMatch = source.match(/const podcasterScriptEditorRuntimeApi = \{([\s\S]*?)\n\};/);

if (!runtimeApiMatch) {
  throw new Error("No se encontró podcasterScriptEditorRuntimeApi en podcaster.js.");
}

const runtimeApiBody = runtimeApiMatch[1];
const requiredMembers = [
  "els",
  "getPanelModeCopy",
  "getSessionRows",
  "countTotalDuration",
  "secondsToClock",
  "getActiveSession",
  "upsertActiveSession"
];

const missingMembers = requiredMembers.filter((member) => !new RegExp(`\\b${member}\\b`).test(runtimeApiBody));

if (missingMembers.length) {
  throw new Error(`PodcasterScriptEditorRuntime debe exponer: ${missingMembers.join(", ")}`);
}

if (!/import\s+\{[\s\S]*requirePodcasterScriptEditorRuntime[\s\S]*\}\s+from\s+"\.\/podcaster-runtime-registry\.js";/.test(editorSource)) {
  throw new Error("podcaster-script-editor.js debe importar requirePodcasterScriptEditorRuntime desde el registry.");
}

if (!/function getScriptEditorRuntime\(\)\s*\{\s*return requirePodcasterScriptEditorRuntime\(\);\s*\}/.test(editorSource)) {
  throw new Error("podcaster-script-editor.js debe resolver su runtime desde el registry modular.");
}

if (!/registerPodcasterScriptEditorRuntime\(podcasterScriptEditorApi\);/.test(editorSource)) {
  throw new Error("podcaster-script-editor.js debe registrar podcasterScriptEditorApi en el registry modular.");
}

if (/window\.getSessionRows\(/.test(editorSource)) {
  throw new Error("podcaster-script-editor.js no debe depender de window.getSessionRows.");
}

if (!/registerPodcasterScriptEditorRuntime\(podcasterScriptEditorRuntimeApi\);/.test(source)) {
  throw new Error("podcaster.js debe registrar podcasterScriptEditorRuntimeApi en el registry modular.");
}

if (!/export function requirePodcasterScriptEditorRuntime\(\)/.test(registrySource)) {
  throw new Error("El runtime registry debe exponer requirePodcasterScriptEditorRuntime.");
}

if (!/scriptEditorRuntime = scriptEditorRuntime && typeof scriptEditorRuntime === "object"\s*\?\s*\{ \.\.\.scriptEditorRuntime, \.\.\.api \}\s*:\s*\{ \.\.\.api \};/s.test(registrySource)) {
  throw new Error("El runtime registry debe fusionar dependencias y API del script editor.");
}

if (/window\.PodcasterScriptEditor\.(renderScript|buildScriptRowEditorMarkup|buildBlankScriptRow|buildInspectorScriptRowMarkup|handleScriptFieldUpdate|shouldHandleScriptFieldOnInput)/.test(source)) {
  throw new Error("podcaster.js no debe depender de window.PodcasterScriptEditor para los wrappers principales.");
}

const scriptEditorIndex = htmlSource.indexOf('src="podcaster/podcaster-script-editor.js?v=2026-05-17.2"');
const podcasterIndex = htmlSource.indexOf('src="podcaster/podcaster.js?v=2026-05-18.1"');
if (!(scriptEditorIndex >= 0 && podcasterIndex > scriptEditorIndex)) {
  throw new Error("podcaster.html debe cargar podcaster-script-editor.js antes que podcaster.js.");
}

console.log("Podcaster script editor runtime API OK.");
