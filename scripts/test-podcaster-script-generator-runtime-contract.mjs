import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const generatorRequirements = [
  "SPEECH_WORDS_PER_SEC",
  "normalizeTtsDirectionConfig",
  "getDefaultSpeakerNameMap",
  "hostsForCount",
  "buildSpeakerAliasMap",
  "resolveSpeakerFromAliases",
  "splitDialogueTextIntoSegments"
];

const missingGeneratorBindings = generatorRequirements.filter((name) => !new RegExp(`\\b${name}\\b`).test(generatorSource));
if (missingGeneratorBindings.length) {
  throw new Error(`podcaster-script-generator.js debe referenciar: ${missingGeneratorBindings.join(", ")}`);
}

const requiredWindowExports = [
  "window.SPEECH_WORDS_PER_SEC = SPEECH_WORDS_PER_SEC;",
  "window.normalizeTtsDirectionConfig = normalizeTtsDirectionConfig;",
  "window.getDefaultSpeakerNameMap = getDefaultSpeakerNameMap;",
  "window.hostsForCount = hostsForCount;",
  "window.buildSpeakerAliasMap = buildSpeakerAliasMap;",
  "window.resolveSpeakerFromAliases = resolveSpeakerFromAliases;",
  "window.splitDialogueTextIntoSegments = splitDialogueTextIntoSegments;"
];

const missingExports = requiredWindowExports.filter((snippet) => !runtimeSource.includes(snippet));
if (missingExports.length) {
  throw new Error(`podcaster.js debe exportar globals para script-generator: ${missingExports.join(" | ")}`);
}

console.log("Podcaster script generator runtime contract OK.");
