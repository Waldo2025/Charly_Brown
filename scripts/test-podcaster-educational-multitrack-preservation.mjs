import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/function hasExplicitMultiTrackTimeline\(session = null\) \{/.test(source)) {
  throw new Error("Debe existir un helper para detectar timelines multipista explicitos.");
}

if (!/const preserveTrackLayout = hasExplicitMultiTrackTimeline\(beforeSession\);/.test(source)
  || !/const ordered = \(educationalVideoMode \|\| preserveTrackLayout\)/.test(source)
  || !/trackId: \(educationalVideoMode && !preserveTrackLayout\) \? primaryTrackId : String\(clip\?\.trackId \|\| ""\)\.trim\(\)/.test(source)) {
  throw new Error("El reorder no debe colapsar tracks explicitos en modo educativo.");
}

if (!/const nextSession = \{[\s\S]*timelineClipsByRowId: nextClips[\s\S]*\};[\s\S]*timelineTracks: ensureTimelineTracks\(nextSession, \{ persist: false \}\),/m.test(source)) {
  throw new Error("El reorder debe reconstruir timelineTracks a partir del layout reordenado, no del snapshot anterior.");
}

if (!/if \(!activeSession \|\| !isEducationalVideoMode\(activeSession\) \|\| hasExplicitMultiTrackTimeline\(activeSession\)\) return false;/.test(source)) {
  throw new Error("compactEducationalTimelineLayout debe ignorar timelines multipista explicitos.");
}

if (!/if \(isEducationalVideoMode\(activeSession\) && !hasExplicitMultiTrackTimeline\(activeSession\)\) \{[\s\S]*compactEducationalTimelineLayout\(activeSession, \{ pinGeminiTrackRow: true, render: false \}\);/m.test(source)) {
  throw new Error("Importar Gemini solo debe compactar en modo educativo cuando siga siendo monotrack.");
}

if (/looksReset && \(educational \|\| trackIds\.size <= 1\)/.test(source)
  || /if \(educational \|\| trackIds\.size <= 1\)/.test(source)) {
  throw new Error("El auto-repair no debe tratar cualquier timeline educativo como monotrack.");
}

console.log("Podcast educational multitrack preservation OK.");
