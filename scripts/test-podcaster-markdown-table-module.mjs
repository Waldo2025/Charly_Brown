import { existsSync, readFileSync } from "node:fs";

const modulePath = new URL("../public/podcaster/podcaster-markdown-table.js", import.meta.url);
const chatAssistantPath = new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url);
const scriptGeneratorPath = new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url);
const podcasterPath = new URL("../public/podcaster/podcaster.js", import.meta.url);

if (!existsSync(modulePath)) {
  throw new Error("Debe existir el módulo shared podcaster-markdown-table.js.");
}

const moduleSource = readFileSync(modulePath, "utf8");
const chatAssistantSource = readFileSync(chatAssistantPath, "utf8");
const scriptGeneratorSource = readFileSync(scriptGeneratorPath, "utf8");
const podcasterSource = readFileSync(podcasterPath, "utf8");

if (!/export function toMarkdownTableCell\(/.test(moduleSource)) {
  throw new Error("podcaster-markdown-table.js debe exportar toMarkdownTableCell.");
}

if (!/from "\.\/podcaster-markdown-table\.js"/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js debe importar toMarkdownTableCell desde podcaster-markdown-table.js.");
}

if (!/from "\.\/podcaster-markdown-table\.js"/.test(scriptGeneratorSource)) {
  throw new Error("podcaster-script-generator.js debe importar toMarkdownTableCell desde podcaster-markdown-table.js.");
}

if (/window\.toMarkdownTableCell\s*\(/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js no debe seguir llamando window.toMarkdownTableCell.");
}

if (/const\s*\{[\s\S]*toMarkdownTableCell[\s\S]*\}\s*=\s*window/.test(scriptGeneratorSource)) {
  throw new Error("podcaster-script-generator.js no debe seguir capturando toMarkdownTableCell desde window.");
}

if (/function\s+toMarkdownTableCell\b/.test(podcasterSource)) {
  throw new Error("podcaster.js ya no debe hospedar toMarkdownTableCell; el helper pertenece al módulo shared.");
}

console.log("Podcaster markdown table shared-module regression checks OK.");
