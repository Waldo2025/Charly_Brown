import { readFileSync } from "node:fs";

const timelineModelSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url),
  "utf8"
);
const sharedSource = readFileSync(
  new URL("../public/podcaster/podcaster-generation-shared.js", import.meta.url),
  "utf8"
);

if (!/import\s+\{\s*requirePodcasterGenerationShared\s*\}\s+from\s+"\.\/podcaster-generation-shared\.js";/m.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe importar requirePodcasterGenerationShared desde podcaster-generation-shared.js.");
}

if (!/function requirePodcasterGenerationApi\(\)\s*\{\s*return requirePodcasterGenerationShared\(\);\s*\}/m.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe resolver el estado de generación desde el shared registry.");
}

if (/const normalizeGeminiDialogueTrack = \(\.\.\.args\) => window\.normalizeGeminiDialogueTrack\(\.\.\.args\);/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de window.normalizeGeminiDialogueTrack durante el bootstrap.");
}

if (!/function normalizeGeminiDialogueTrack\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir normalizeGeminiDialogueTrack localmente.");
}

if (/const resolveStorageAudioUrl = \(\.\.\.args\) => window\.resolveStorageAudioUrl\(\.\.\.args\);/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de window.resolveStorageAudioUrl durante el bootstrap.");
}

if (!/function resolveStorageAudioUrl\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir resolveStorageAudioUrl localmente.");
}

if (/const resolveRowAudioDurationMs = \(\.\.\.args\) => window\.resolveRowAudioDurationMs\(\.\.\.args\);/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe mantener el proxy legacy de resolveRowAudioDurationMs.");
}

if (!/function resolveRowAudioDurationMs\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir resolveRowAudioDurationMs localmente.");
}

if (/const getActiveSession = \(\.\.\.args\) => window\.getActiveSession\(\.\.\.args\);/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de window.getActiveSession durante el bootstrap.");
}

if (!/function getActiveSession\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir getActiveSession localmente.");
}

if (/const isEducationalVideoMode = \(\.\.\.args\) => window\.isEducationalVideoMode\(\.\.\.args\);/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de window.isEducationalVideoMode durante el bootstrap.");
}

if (!/function isEducationalVideoMode\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir isEducationalVideoMode localmente.");
}

if (/\bpodcastVideoState\./.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de podcastVideoState como binding global implícito.");
}

if (!/function getPodcastVideoState\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir getPodcastVideoState localmente.");
}

if (/window\.ensureOnScreenTextClipsByRowId\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js no debe depender de window.ensureOnScreenTextClipsByRowId durante el bootstrap.");
}

if (!/function ensureOnScreenTextClipsByRowId\(/.test(timelineModelSource)) {
  throw new Error("podcaster-timeline-model.js debe definir ensureOnScreenTextClipsByRowId localmente.");
}

if (!/export function requirePodcasterGenerationShared\(\)/.test(sharedSource)) {
  throw new Error("podcaster-generation-shared.js debe exponer requirePodcasterGenerationShared.");
}

console.log("Podcaster timeline generation runtime contract OK.");
