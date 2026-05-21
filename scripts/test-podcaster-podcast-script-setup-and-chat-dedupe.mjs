import { readFileSync } from "node:fs";

const podcasterJs = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
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

if (!/const podcasterGenerationRuntimeApi = \{[\s\S]*normalizeVideoPreset,[\s\S]*normalizeVideoContentType,[\s\S]*buildSpeakerNameMap,[\s\S]*buildShortSessionTitle,[\s\S]*forceHostsAndAlternation,[\s\S]*createDefaultRows,[\s\S]*sanitizeSpeakerMentionsInDialogue,[\s\S]*DEFAULT_TTS_DIRECTION_CONFIG,[\s\S]*\};/m.test(podcasterJs)) {
  throw new Error("podcaster.js debe exponer los helpers de normalizeScriptPayload en el runtime global.");
}

if (!/DEFAULT_TTS_DIRECTION_CONFIG,\s*SPEECH_WORDS_PER_SEC/.test(generatorJs)) {
  throw new Error("El generador de guiones debe importar DEFAULT_TTS_DIRECTION_CONFIG desde window.");
}

// resolveVideoContentType is now a lazy proxy, not destructured directly from window
if (!/normalizeVideoContentType,\s*normalizeVideoPreset,\s*isCurrentModeVideo/.test(generatorJs)) {
  throw new Error("El generador de guiones debe importar normalizeVideoContentType y normalizeVideoPreset desde window.");
}

if (!/const resolveVideoContentType = \(session/.test(generatorJs)) {
  throw new Error("El generador de guiones debe definir resolveVideoContentType como proxy lazy.");
}

if (!/buildSpeakerAliasMap,\s*buildSpeakerNameMap,\s*resolveSpeakerFromAliases/.test(generatorJs)) {
  throw new Error("El generador de guiones debe importar buildSpeakerNameMap desde window.");
}

if (!/splitDialogueTextIntoSegments,\s*forceHostsAndAlternation,\s*createDefaultRows,\s*sanitizeSpeakerMentionsInDialogue/.test(generatorJs)) {
  throw new Error("El generador de guiones debe importar los helpers de fallback y saneamiento desde window.");
}

if (!/normalizeCreativeRow,\s*buildShortSessionTitle/.test(generatorJs)) {
  throw new Error("El generador de guiones debe importar buildShortSessionTitle desde window.");
}

if (!/pendingScriptPromptHtml\s*=\s*promptHtml;[\s\S]*pendingScriptTableMode\s*=\s*composerVideoTableMode === "create" \? "create" : "compose";[\s\S]*primeScriptSetupModal\(\);[\s\S]*setScriptSetupOpen\(true\);/m.test(podcasterJs)) {
  throw new Error("El modo podcast debe abrir el modal de configuración tanto en compose como en create.");
}

if (/\/\/ Podcast mode \(script\)[\s\S]*addChatMessage\("user", prompt, promptHtml \? \{ html: promptHtml \} : \{\}\);[\s\S]*handleGenerate\(prompt, \{[\s\S]*tableMode: "compose"/m.test(podcasterJs)) {
  throw new Error("El modo podcast ya no debe duplicar el mensaje del usuario antes de handleGenerate.");
}

if (!/await handleGenerate\(basePrompt, \{[\s\S]*userMessageHtml: pendingPromptHtml,[\s\S]*tableMode: pendingTableMode,[\s\S]*constraints: setup[\s\S]*\}\);/m.test(podcasterJs)) {
  throw new Error("El submit del modal debe reenviar el HTML original y el tableMode correcto a handleGenerate.");
}

if (!/id="scriptSetupVideoModeRow"/.test(podcasterHtml)) {
  throw new Error("El modal de configuración debe exponer un contenedor identificable para la opción de video.");
}

console.log("Podcaster podcast script setup and chat dedupe OK.");
