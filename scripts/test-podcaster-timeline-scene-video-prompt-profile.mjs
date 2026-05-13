import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("promptProfile: \"timeline-scene-video\"")) {
  throw new Error("timeline-generate-scene-video debe enviar promptProfile específico.");
}

if (!source.includes("sceneDescription: String(row?.sceneDescription || row?.scenePrompt || \"\").trim()")) {
  throw new Error("La solicitud de video por escena debe enviar sceneDescription explícito.");
}

if (!source.includes("visualNotes: String(resolveVisualNotesForGeneration(row) || row?.visual || \"\").trim()")) {
  throw new Error("La solicitud de video por escena debe enviar visualNotes explícito.");
}

if (!source.includes("promptProfile: options.promptProfile || \"\"")) {
  throw new Error("generateDialogueVideoForRow debe propagar promptProfile al request.");
}

console.log("Timeline scene video prompt profile frontend regression OK.");
