import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (/data-setting="stylePreset"/.test(source) || />\s*Acabado\s*</.test(source)) {
  throw new Error("El modal ya no debe exponer el control Acabado/stylePreset.");
}

if (!/data-setting="fontVariant"/.test(source)) {
  throw new Error("El modal debe renderizar un control combinado para peso y estilo.");
}

if (!/data-setting="strokeColor"/.test(source) || !/data-setting="strokeWidthPx"/.test(source)) {
  throw new Error("El modal debe exponer controles de color y grosor de stroke.");
}

if (!/function normalizeOnScreenTextTrackSettings\(raw = \{\}\) \{[\s\S]*const strokeColor = String\(source\.strokeColor \|\| ""\)\.trim\(\) \|\| "#0f172a";[\s\S]*const strokeWidthPx = Math\.max\(0, Math\.min\(12, toFiniteNumber\(source\.strokeWidthPx, Number\.NaN\)\)\);[\s\S]*strokeColor,[\s\S]*strokeWidthPx:/m.test(source)) {
  throw new Error("La normalización del track debe soportar strokeColor y strokeWidthPx.");
}

if (!/else if \(key === "fontVariant"\) \{[\s\S]*current\.fontWeight = isBold \? "bold" : "normal";[\s\S]*current\.fontStyle = isItalic \? "italic" : "normal";/m.test(source)) {
  throw new Error("El setter debe descomponer fontVariant a fontWeight y fontStyle.");
}

const setterStart = source.indexOf('function setOnScreenTextTrackSetting(setting = "fontFamily", value = "", options = {}) {');
const setterEnd = source.indexOf("\nfunction syncOnScreenTextTrackToggleBtn(", setterStart);
const setterBody = setterStart >= 0 && setterEnd > setterStart ? source.slice(setterStart, setterEnd) : "";
if (!/if \(options\?\.renderShell === true\) \{\s*renderPodcastVideoShell\(session\);\s*\}/m.test(setterBody)) {
  throw new Error("El render completo del shell debe quedar solo como camino explícito y no por defecto.");
}

if (!/onScreenTextTrackModal\.addEventListener\("input",[\s\S]*setOnScreenTextTrackSetting\(settingTarget\.dataset\.setting, settingTarget\.value, \{[^}]*autosave:\s*false[^}]*renderModal:\s*false[^}]*\}\)/m.test(source)) {
  throw new Error("El flujo de input del modal debe evitar autosave y re-render del modal durante el drag.");
}

if (!/onScreenTextTrackModal\.addEventListener\("change",[\s\S]*setOnScreenTextTrackSetting\(settingTarget\.dataset\.setting, settingTarget\.value, \{[^}]*autosave:\s*true[^}]*renderModal:\s*true[^}]*\}\)/m.test(source)) {
  throw new Error("El flujo de change del modal debe consolidar persistencia y resincronización visual.");
}

console.log("Podcast onscreen text modal controls OK.");
