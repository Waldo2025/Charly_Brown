import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-public-library.js", import.meta.url), "utf8");

if (!/function insertLibrarySceneIntoSession\(item = null, options = \{\}\) \{/.test(source)) {
  throw new Error("Falta insertLibrarySceneIntoSession para validar insercion en track nuevo.");
}

if (!/if \(insertIntoNewTrack\) \{[\s\S]*assignedTrackId = variantTrack\.id;[\s\S]*nextTracks\.splice\([\s\S]*nextTracks = runtime\.normalizeTimelineTracks\(nextTracks\);/m.test(source)) {
  throw new Error("Insertar desde biblioteca en track nuevo debe crear y normalizar un track nuevo.");
}

if (!/timelineViewMode:\s*insertIntoNewTrack\s*\?\s*"tracks"\s*:\s*\(String\(cfg\.timelineViewMode \|\| "tracks"\)\.trim\(\)\.toLowerCase\(\) === "normal" \? "normal" : "tracks"\)/m.test(source)) {
  throw new Error("Insertar en track nuevo debe forzar la vista timeline en modo tracks.");
}

if (!/(window\.)?setTimelineViewMode\("tracks"\);/.test(source)) {
  throw new Error("La UI debe pasar a modo tracks tras insertar en track nuevo.");
}

console.log("Podcast library insert new-track flow OK.");
