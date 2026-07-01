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

// 4. Ensure script tag is present and loaded before podcaster.js because podcaster.js
// calls renderChat during bootstrap.
const chatScriptIndex = htmlSource.indexOf('data-cache-src="podcaster/podcaster-chat-assistant.js" data-cache-type="module"');
const podcasterScriptIndex = htmlSource.indexOf('data-cache-src="podcaster/podcaster.js" data-cache-type="module"');
if (chatScriptIndex === -1) {
  throw new Error("podcaster.html no carga podcaster-chat-assistant.js con cache-version-loader.");
}
if (podcasterScriptIndex === -1) {
  throw new Error("podcaster.html no carga podcaster.js con cache-version-loader.");
}
if (!(chatScriptIndex < podcasterScriptIndex)) {
  throw new Error("podcaster-chat-assistant.js debe cargar antes de podcaster.js para registrar renderChat antes del bootstrap.");
}

console.log("Chat Assistant modularization regression checks OK.");
