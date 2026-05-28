import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const shared = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const editor = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text-track-editor.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/data-setting="stylePreset"/.test(shared)) {
  throw new Error("El modal debe seguir exponiendo el selector de variante visual.");
}

if (!/data-setting="fontVariant"/.test(shared)) {
  throw new Error("El modal debe renderizar un control combinado para peso y estilo.");
}

if (!/data-setting="strokeColor"/.test(shared) || !/data-setting="strokeWidthPx"/.test(shared)) {
  throw new Error("El modal debe exponer controles de color y grosor de stroke.");
}

if (!/function normalizeOnScreenTextTrackSettings\(raw = \{\}\) \{[\s\S]*const strokeColor = String\(source\.strokeColor \|\| ""\)\.trim\(\) \|\| "#0f172a";[\s\S]*const strokeWidthPx = Math\.max\(0, Math\.min\(12, toFiniteNumber\(source\.strokeWidthPx, Number\.NaN\)\)\);[\s\S]*strokeColor,[\s\S]*strokeWidthPx:/m.test(shared)) {
  throw new Error("La normalización del track debe vivir en la spec compartida y soportar strokeColor y strokeWidthPx.");
}

if (!/const normalizeOnScreenTextTrackSettings = requireOnScreenTextApiFunction\("normalizeOnScreenTextTrackSettings"\);/.test(source)) {
  throw new Error("Podcaster debe delegar la normalización del track al módulo compartido.");
}

if (!/else if \(key === "fontVariant"\) \{[\s\S]*current\.fontVariant = selected\.value;[\s\S]*current\.fontWeight = selected\.fontWeight;[\s\S]*current\.fontStyle = selected\.fontStyle;/m.test(shared)) {
  throw new Error("El setter debe descomponer fontVariant a fontWeight y fontStyle.");
}

const setterStart = editor.indexOf('function setTrackSetting(setting = "fontFamily", value = "", options = {}) {');
const setterEnd = editor.indexOf("\n  function syncAnchorAcrossLayouts(", setterStart);
const setterBody = setterStart >= 0 && setterEnd > setterStart ? editor.slice(setterStart, setterEnd) : "";
if (!/if \(options\?\.renderShell === true\) \{\s*renderPodcastVideoShell\(session\);\s*\}/m.test(setterBody)) {
  throw new Error("El render completo del shell debe quedar solo como camino explícito y no por defecto.");
}

if (!/onScreenTextTrackModal\.addEventListener\("input",[\s\S]*setOnScreenTextTrackSetting\(settingTarget\.dataset\.setting, settingTarget\.value, \{[^}]*autosave:\s*false[^}]*renderModal:\s*false[^}]*\}\)/m.test(source)) {
  throw new Error("El flujo de input del modal debe evitar autosave y re-render del modal durante el drag.");
}

if (!/onScreenTextTrackModal\.addEventListener\("change",[\s\S]*setOnScreenTextTrackSetting\(settingTarget\.dataset\.setting, settingTarget\.value, \{[^}]*autosave:\s*true[^}]*renderModal:\s*true[^}]*\}\)/m.test(source)) {
  throw new Error("El flujo de change del modal debe consolidar persistencia y resincronización visual.");
}

if (!/boxWidthPct:\s*clampNumber\(trackRaw\?\.boxWidthPct,\s*0\.22,\s*0\.92,\s*0\.58\)/.test(backend)) {
  throw new Error("El backend debe conservar boxWidthPct al guardar y rehidratar onScreenTextTrack.");
}

console.log("Podcast onscreen text modal controls OK.");
