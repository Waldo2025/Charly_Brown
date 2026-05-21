import { existsSync, readFileSync } from "node:fs";

const modulePath = new URL("../public/podcaster/podcaster-speaker-text.js", import.meta.url);
const chatAssistantPath = new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url);
const podcasterPath = new URL("../public/podcaster/podcaster.js", import.meta.url);

if (!existsSync(modulePath)) {
  throw new Error("Debe existir el módulo shared podcaster-speaker-text.js.");
}

const moduleSource = readFileSync(modulePath, "utf8");
const chatAssistantSource = readFileSync(chatAssistantPath, "utf8");
const podcasterSource = readFileSync(podcasterPath, "utf8");

if (!/export function replaceHostTokensWithNames\(/.test(moduleSource)) {
  throw new Error("podcaster-speaker-text.js debe exportar replaceHostTokensWithNames.");
}

if (!/from "\.\/podcaster-speaker-text\.js"/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js debe importar replaceHostTokensWithNames desde podcaster-speaker-text.js.");
}

if (/window\.replaceHostTokensWithNames\s*\(/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js no debe seguir llamando window.replaceHostTokensWithNames.");
}

if (/function\s+replaceHostTokensWithNames\b/.test(podcasterSource)) {
  throw new Error("podcaster.js ya no debe hospedar replaceHostTokensWithNames; el helper pertenece al módulo shared.");
}

console.log("Podcaster speaker text shared-module regression checks OK.");
