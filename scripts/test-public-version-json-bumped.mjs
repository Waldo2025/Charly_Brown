import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.match(version.version, /^1\.0\.10\.\d+$/);
assert.equal(version.cache_version, version.build);
const changelog = Array.isArray(version.changelog) ? version.changelog : [];
const releaseNotes = Array.isArray(version.releaseNotes) ? version.releaseNotes : [];
const notes = [...changelog, ...releaseNotes];
assert.ok(
  String(changelog[0] || "").includes("Podcaster")
    && String(changelog[0] || "").includes("texto en pantalla")
    && String(changelog[0] || "").includes("1920x1080")
    && String(changelog[0] || "").includes("fondo de color")
    && String(changelog[0] || "").includes("base negra"),
  "La nota más reciente debe reflejar el fix del export MP4 con texto y fondos de color."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audio Gemini")
    && String(note || "").includes("reproducir el timeline")),
  "Las release notes deben conservar el fix del texto en pantalla con velocidad de audio Gemini."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("mapas del timeline")
    && String(note || "").includes("fondos de color")),
  "Las release notes deben conservar la rehidratación profunda del timeline de Podcaster."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Home")
    && String(note || "").includes("panelMusicConfig")
    && String(note || "").includes("audio de fondo")),
  "Las release notes deben conservar la carga del audio de fondo de Podcaster en Home."
);
assert.ok(
  notes.some((note) => String(note || "").includes("raster")
    && String(note || "").includes("frontend")
    && String(note || "").includes("karaoke")),
  "Las release notes deben conservar el fix de raster/frontend/karaoke."
);
assert.ok(
  notes.some((note) => String(note || "").includes("same-origin")),
  "Las release notes deben conservar el fix de same-origin."
);
assert.ok(
  notes.some((note) => String(note || "").includes("job_not_found")),
  "Las release notes deben conservar el fix de retry tolerante para job_not_found."
);

console.log("public version.json bumped OK.");
