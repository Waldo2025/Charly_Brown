import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url), "utf8");
const videoGeneratorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

const requiredSnippets = [
  "speakerLabel: String(row?.speaker || \"\").trim()",
  "speakerName: window.resolveSpeakerDisplayName(row?.speaker, session)",
  "targetSpeechLine: text",
  "ttsDirection: row?.ttsDirectionConfig || {}"
];

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));

if (missing.length) {
  throw new Error(`Payload de dialogue-audio incompleto: ${missing.join(", ")}`);
}

if (!source.includes('window.resolveConfiguredSpeakerVoiceForGeneration(row, session)')) {
  throw new Error("La generación de audio Gemini debe resolver la voz configurada usando la fila completa.");
}

if (!source.includes('window.flushScriptEditorVoiceDraftsToSession?.();')) {
  throw new Error("La regeneración/generación de audio Gemini debe volcar primero los drafts visibles de voiceName al estado de sesión.");
}

if (!videoGeneratorSource.includes('voiceName: resolveConfiguredSpeakerVoiceForGeneration(row, session)')) {
  throw new Error("La generación de video/voz derivada también debe usar la voz configurada por fila.");
}

console.log("Podcaster dialogue audio payload OK.");
