import fs from "node:fs";

const podcasterSource = fs.readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const chatAssistantSource = fs.readFileSync(new URL("../public/podcaster/podcaster-chat-assistant.js", import.meta.url), "utf8");
const objectAssignMatch = podcasterSource.match(/Object\.assign\(window,\s*\{([\s\S]*?)\n\}\);/m);
const podcasterWindowExportBlock = objectAssignMatch?.[1] || "";

if (/\n\s*setButtonLoadingState,\s*\n/m.test(podcasterSource)) {
  throw new Error("podcaster.js no debe referenciar setButtonLoadingState por binding léxico dentro de Object.assign(window, ...); debe leerlo desde window para no romper la carga.");
}

const forbiddenLegacyExports = [
  "setButtonLoadingState",
  "getRowReferenceImageListMap",
  "getRowReferenceImageList",
  "getRowReferenceImageMap",
  "getRowReferenceVideoMap",
  "resolveCreativeVisualNotesText",
  "buildOnScreenText",
  "ensureCompleteSentence",
  "rewriteScenarioPromptForEducationalVideo",
  "hasAvailableApiBase"
];

for (const name of forbiddenLegacyExports) {
  const exportRegex = new RegExp(`\\n\\s*${name}(?:\\s*:)?`, "m");
  if (exportRegex.test(podcasterWindowExportBlock)) {
    throw new Error(`podcaster.js no debe seguir reexportando ${name}; ese helper ya pertenece a un módulo migrado.`);
  }
}

if (!/const escapeHtml = typeof window\.escapeHtml === "function"\s*\?\s*window\.escapeHtml\s*:\s*\(/m.test(chatAssistantSource)) {
  throw new Error("podcaster-chat-assistant.js debe tener fallback local para escapeHtml cuando window.escapeHtml aún no está expuesto.");
}

console.log("Podcaster chat global helpers regression test OK.");
