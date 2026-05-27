import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");

const syncStart = source.indexOf("function syncGeminiDialogueTrackWithRuntime(options = {})");
const syncEnd = source.indexOf("function countAvailableGeminiDialogueRows", syncStart);
if (syncStart < 0 || syncEnd < 0) {
  throw new Error("No se encontró syncGeminiDialogueTrackWithRuntime.");
}

const syncFn = source.slice(syncStart, syncEnd);

if (!syncFn.includes("isTrimStart: options.isTrimStart === true")) {
  throw new Error("syncGeminiDialogueTrackWithRuntime no propaga isTrimStart al reconciliar el track Gemini.");
}

const trimStartCallMatch = interactionSource.match(
  /if \(dragMode === "trim-start" \|\| dragMode === "trim-end"\) \{[\s\S]*?syncGeminiDialogueTrackWithRuntime\(\{[\s\S]*?isTrimStart: dragMode === "trim-start"[\s\S]*?\}\);[\s\S]*?\}/m
);

if (!trimStartCallMatch) {
  throw new Error("No se encontró la sincronización del track Gemini al terminar un trim-start/trim-end.");
}

console.log("Gemini trim-start sync preserves audio position OK.");
