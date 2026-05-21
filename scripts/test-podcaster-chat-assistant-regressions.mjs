import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const chatAssistantSource = readFileSync(new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

const purgedFunctions = [
  "buildPodcastAssistantReply",
  "buildCreativeVideoAssistantReply",
  "buildScriptAssistantReply",
  "addChatMessage",
  "removeChatMessage",
  "addScriptAssistantMessage",
  "sanitizeChatHtml",
  "splitMarkdownTableCells",
  "isMarkdownDividerCell",
  "convertMarkdownTableAt",
  "renderChatTextWithMarkdownTables",
  "renderChatMessageBody",
  "renderChat"
];

// 1. Ensure functions are purged from podcaster.js
for (const fn of purgedFunctions) {
  const pattern = new RegExp(`function\\s+${fn}\\b`);
  if (pattern.test(podcasterSource)) {
    throw new Error(`podcaster.js todavía contiene la función modularizada: ${fn}`);
  }
}

// 2. Ensure functions exist in podcaster-chat-assistant.js
for (const fn of purgedFunctions) {
  const pattern = new RegExp(`function\\s+${fn}\\b`);
  if (!pattern.test(chatAssistantSource)) {
    throw new Error(`podcaster-chat-assistant.js no contiene la función esperada: ${fn}`);
  }
}

// 3. Ensure required helper exposures exist in podcaster.js
const requiredExposures = [
  "normalizeRows",
  "countTotalDuration",
  "resolveSpeakerDisplayName",
  "toMarkdownTableCell",
  "normalizeCreativeVideoConfig",
  "getCreativeVideoConfig",
  "normalizeTransitionForScene",
  "resolveCreativeVisualNotesText",
  "buildOnScreenText",
  "ensureCompleteSentence",
  "SHORT_SCENE_MIN_SEC",
  "SHORT_SCENE_MAX_SEC",
  "VIDEO_SCENE_MIN_SEC",
  "VIDEO_SCENE_MAX_SEC",
  "normalizeCreativeVideoScriptForDisplay",
  "buildSpeakerMapsForHosts"
];

for (const exposure of requiredExposures) {
  const pattern = new RegExp(`\\b${exposure}\\b`);
  if (!pattern.test(podcasterSource)) {
    throw new Error(`podcaster.js no expone o referencia la dependencia requerida del Chat Assistant: ${exposure}`);
  }
}

// 4. Ensure script tag is present in podcaster.html
if (!/<script type="module" src="podcaster\/podcaster-chat-assistant\.js\?v=[\d\.-]+"><\/script>/.test(htmlSource)) {
  throw new Error("podcaster.html no carga el nuevo script podcaster-chat-assistant.js como un módulo.");
}

console.log("Chat Assistant modularization regression checks OK.");
