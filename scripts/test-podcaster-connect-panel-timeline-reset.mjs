import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../public/podcaster/podcaster-script-generator.js", import.meta.url),
  "utf8"
);
const timelineModelSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url),
  "utf8"
);
const audioTimelineSource = readFileSync(
  new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/timelineTracks:\s*\[\]/.test(generatorSource) || !/timelineClipsByRowId:\s*\{\}/.test(generatorSource)) {
  throw new Error("connectScriptSnapshotToPanel debe reiniciar timelineTracks y timelineClipsByRowId al conectar un guión nuevo.");
}

if (!/geminiDialogueTrack:\s*\{\s*enabled:\s*false,\s*segments:\s*\[\]/s.test(generatorSource)) {
  throw new Error("connectScriptSnapshotToPanel debe reiniciar geminiDialogueTrack al conectar un guión nuevo.");
}

if (!/window\.reflowTimelineClipsByScriptOrder\?\.\(updatedSession,\s*\{\s*persist:\s*true,\s*render:\s*false\s*\}\)/.test(generatorSource)) {
  throw new Error("connectScriptSnapshotToPanel debe reflowear el timeline tras conectar un guión.");
}

if (!/const lockPodcastTracksToSpeakers = isPodcastMode\(activeSession\) && !isEducationalVideoMode\(activeSession\);/.test(timelineModelSource)) {
  throw new Error("El timeline model debe bloquear tracks podcast a los locutores reales.");
}

if (!/const selectedTrackId = lockPodcastTracksToSpeakers[\s\S]*validTrackIds\.has\(speakerTrackId\)/.test(timelineModelSource)) {
  throw new Error("ensureTimelineClipsByRowId debe priorizar el track del locutor en podcast.");
}

if (!/window\.reflowTimelineClipsByScriptOrder\?\.\(window\.getActiveSession\(\),\s*\{\s*persist:\s*true,\s*render:\s*false\s*\}\)/.test(audioTimelineSource)) {
  throw new Error("La generación conectada de audios debe reflowear el timeline al terminar.");
}

if (!/const updatedSession = connectScriptSnapshotToPanel\(message\.scriptSnapshot \|\| \{\},\s*\{/.test(podcasterSource)) {
  throw new Error("El handler del chat debe reutilizar connectScriptSnapshotToPanel.");
}

console.log("Podcaster connect-panel timeline reset OK.");
