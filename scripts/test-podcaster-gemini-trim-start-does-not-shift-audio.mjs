import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const syncFnMatch = source.match(
  /function syncGeminiDialogueTrackWithRuntime\(options = \{\}\) \{[\s\S]*?const reconciled = reconcileGeminiDialogueTrackWithRuntime\(activeSession, current, \{[\s\S]*?\}\);/m
);

if (!syncFnMatch) {
  throw new Error("No se encontró syncGeminiDialogueTrackWithRuntime.");
}

const syncFn = syncFnMatch[0];

if (!syncFn.includes("isTrimStart: options.isTrimStart === true")) {
  throw new Error("syncGeminiDialogueTrackWithRuntime no propaga isTrimStart al reconciliar el track Gemini.");
}

const trimStartCallMatch = source.match(
  /if \(dragMode === "trim-start" \|\| dragMode === "trim-end"\) \{[\s\S]*?syncGeminiDialogueTrackWithRuntime\(\{[\s\S]*?isTrimStart: dragMode === "trim-start"[\s\S]*?\}\);[\s\S]*?\}/m
);

if (!trimStartCallMatch) {
  throw new Error("No se encontró la sincronización del track Gemini al terminar un trim-start/trim-end.");
}

console.log("Gemini trim-start sync preserves audio position OK.");
