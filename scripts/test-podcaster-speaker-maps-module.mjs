import { existsSync, readFileSync } from "node:fs";

const speakerMapsPath = new URL("../public/podcaster/podcaster-speaker-maps.js", import.meta.url);
const generatorPath = new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url);
const chatAssistantPath = new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url);
const podcasterPath = new URL("../public/podcaster/podcaster.js", import.meta.url);

if (!existsSync(speakerMapsPath)) {
  throw new Error("Debe existir el módulo shared podcaster-speaker-maps.js.");
}

const speakerMapsSource = readFileSync(speakerMapsPath, "utf8");
const generatorSource = readFileSync(generatorPath, "utf8");
const chatAssistantSource = readFileSync(chatAssistantPath, "utf8");
const podcasterSource = readFileSync(podcasterPath, "utf8");

if (!/export function buildSpeakerMapsForHosts\(/.test(speakerMapsSource)) {
  throw new Error("podcaster-speaker-maps.js debe exportar buildSpeakerMapsForHosts.");
}

if (!/from "\.\/podcaster-speaker-maps\.js"/.test(generatorSource)) {
  throw new Error("podcaster-script-generator.js debe importar buildSpeakerMapsForHosts desde podcaster-speaker-maps.js.");
}

if (!/from "\.\/podcaster-speaker-maps\.js"/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js debe importar buildSpeakerMapsForHosts desde podcaster-speaker-maps.js.");
}

if (/buildSpeakerMapsForHosts,\s*\n?\s*\}\s*=\s*window/.test(generatorSource) || /const\s*\{[\s\S]*buildSpeakerMapsForHosts[\s\S]*\}\s*=\s*window/.test(generatorSource)) {
  throw new Error("podcaster-script-generator.js no debe seguir capturando buildSpeakerMapsForHosts desde window.");
}

if (/window\.buildSpeakerMapsForHosts\s*\(/.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js no debe seguir llamando window.buildSpeakerMapsForHosts.");
}

if (!/from "\.\/podcaster-speaker-maps\.js"/.test(podcasterSource)) {
  throw new Error("podcaster.js debe importar buildSpeakerMapsForHosts desde podcaster-speaker-maps.js.");
}

console.log("Podcaster speaker maps shared-module regression checks OK.");
