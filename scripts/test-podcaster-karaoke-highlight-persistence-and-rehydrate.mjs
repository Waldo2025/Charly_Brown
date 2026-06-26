import { readFileSync } from "node:fs";

const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const sessionPayloadJs = readFileSync(new URL("../public/podcaster/podcaster-session-payload.js", import.meta.url), "utf8");
const backendJs = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const versionJson = JSON.parse(readFileSync(new URL("../public/version.json", import.meta.url), "utf8"));

const structureKeyMatch = podcasterJs.match(/function buildPodcastTimelineStructureKey\(session = null, mode = ""\) \{[\s\S]*?return JSON\.stringify\(\{[\s\S]*?\n  \}\);\n\}/);
if (!structureKeyMatch) {
  throw new Error("No se encontró buildPodcastTimelineStructureKey para validar rehidratación del texto karaoke.");
}
const structureKeySource = structureKeyMatch[0];
[
  "karaokeHighlightColor",
  "karaokeHighlightStyle",
  "karaokeHighlightOpacity",
  "karaokeHighlightPaddingXPx",
  "karaokeHighlightPaddingYPx",
  "karaokeHighlightRadiusPx"
].forEach((field) => {
  if (!structureKeySource.includes(field)) {
    throw new Error(`La clave de estructura debe incluir ${field} para rehidratar cambios de estilo karaoke.`);
  }
});

if (!/podcastVideoConfig:\s*normalizePodcastVideoConfig\?\.\(source\?\.podcastVideoConfig \|\| \{\}\)/.test(sessionPayloadJs)) {
  throw new Error("El payload de sesión debe serializar podcastVideoConfig completo usando normalizePodcastVideoConfig.");
}

[
  "karaokeHighlightColor",
  "karaokeHighlightStyle",
  "karaokeHighlightOpacity",
  "karaokeHighlightPaddingXPx",
  "karaokeHighlightPaddingYPx",
  "karaokeHighlightRadiusPx"
].forEach((field) => {
  if (!backendJs.includes(field)) {
    throw new Error(`El backend debe conservar ${field} al guardar/rehidratar la sesión.`);
  }
});

if (!/podcaster\.js\?v=2026-06-26\.9/.test(html)) {
  throw new Error("podcaster.html debe subir el cache-buster de podcaster.js para publicar la rehidratación karaoke.");
}

if (versionJson.version !== "1.0.10.254" || versionJson.cache_version !== versionJson.build) {
  throw new Error("version.json debe subir a 1.0.10.254 y mantener cache_version alineado con build.");
}

console.log("Podcaster karaoke highlight persistence and rehydrate OK.");
